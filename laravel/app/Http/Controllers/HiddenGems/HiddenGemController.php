<?php

namespace App\Http\Controllers\HiddenGems;

use App\Contracts\ObjectStorage;
use App\Http\Controllers\Controller;
use App\Integrations\Storage\ObjectStorageException;
use App\Jobs\HiddenGems\VerifyHiddenGemSubmission;
use App\Models\Category;
use App\Models\Location;
use App\Models\LocationImage;
use App\Models\Report;
use App\Services\Achievements\SpecialAchievementService;
use App\Services\Geocoding\GeocodingException;
use App\Services\Geocoding\MalaysiaGeocoder;
use App\Services\HiddenGems\HiddenGemSearch;
use App\Services\HiddenGems\OsmAttractionCache;
use App\Support\Geo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;

class HiddenGemController extends Controller
{
    private const PUBLIC_LOCATION_COLUMNS = [
        'id',
        'user_id',
        'category_id',
        'place_name',
        'address',
        'state',
        'description',
        'latitude',
        'longitude',
        'status',
        'report_status',
        'permanently_closed_at',
        'contact_flagged_at',
        'vote_count',
        'verification_threshold',
    ];

    private const INTERNAL_LOCATION_FIELDS = [
        'ai_review_reason',
        'ai_reviewed_at',
        'verification_attempts',
        'verification_score',
        'verification_confidence',
        'google_visibility_level',
        'hiddenness_score',
        'legitimacy_score',
        'legitimacy_level',
        'tourism_value_score',
        'tourism_value_level',
        'evidence_score',
        'evidence_level',
        'duplicate_status',
        'duplicate_of_location_id',
        'verification_result_json',
        'verification_model',
        'is_hidden_gem',
        'isHidden',
        'created_at',
        'updated_at',
    ];

    private const NEARBY_RADIUS_METERS = 1500;

    private const VIEWPORT_RESULT_LIMIT = 300;

    public function __construct(
        private SpecialAchievementService $specialAchievements,
        private MalaysiaGeocoder $geocoder,
        private HiddenGemSearch $hiddenGemSearch,
        private OsmAttractionCache $attractionCache,
        private ObjectStorage $storage,
    ) {}

    // ==================== API METHODS ====================
    public function store(Request $request): JsonResponse
    {
        if (! Auth::check()) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        $user = Auth::user();

        $request->validate([
            'category_id' => 'required|exists:categories,id',
            'place_name' => 'required|string',
            'address' => 'required|string',
            'state' => 'required|string',
            'postcode' => 'required|digits:5',
            'description' => 'required|string',
            'opening_hours' => 'nullable|string|max:255',
            'phone' => 'nullable|string|max:30',
            'website' => 'nullable|url|max:255',
            'latitude' => 'required|numeric',
            'longitude' => 'required|numeric',
            'images.*' => 'image|max:5120',
        ]);

        $existingLocation = Location::where('place_name', $request->place_name)
            ->where('address', $request->address)
            ->whereNotIn('status', [Location::STATUS_DELETED, Location::STATUS_ARCHIVED])
            ->first();

        if ($existingLocation) {
            return response()->json([
                'message' => 'This location already exists.',
            ], 409);
        }

        $location = Location::create([
            'user_id' => $user->id,
            'category_id' => $request->category_id,
            'place_name' => $request->place_name,
            'address' => $request->address,
            'state' => $request->state,
            'postcode' => $request->postcode,
            'description' => $request->description,
            'opening_hours' => $request->opening_hours,
            'phone' => $request->phone,
            'website' => $request->website,
            'contact_updated_at' => now(),
            'latitude' => $request->latitude,
            'longitude' => $request->longitude,
            'status' => 'pending',
            'vote_count' => 0,
            'verification_threshold' => 10,
        ]);

        // Upload images to local storage
        if ($request->hasFile('images')) {

            foreach ($request->file('images') as $image) {

                $fileName = 'hidden-gems/'.uniqid().'.'.$image->getClientOriginalExtension();

                try {
                    $imageUrl = $this->storage->uploadPublic(
                        config('services.supabase.location_images_bucket', 'location_images'),
                        $fileName,
                        file_get_contents($image->getRealPath()),
                        $image->getMimeType(),
                    );
                } catch (ObjectStorageException $exception) {
                    // Undo the just-created Location (cascades to any images
                    // already attached) so a failed submission never leaves a
                    // stuck, undispatched 'pending' row behind — otherwise the
                    // user can't even resubmit, since it collides with the
                    // duplicate place_name+address check above.
                    $location->delete();

                    return response()->json([
                        'message' => 'Failed to upload image.',
                        'error' => $exception->upstreamError,
                    ], 500);
                }

                LocationImage::create([
                    'location_id' => $location->id,
                    'image_url' => $imageUrl,
                ]);
            }
        }

        // afterCommit(): when the queue is not 'sync' the worker must not pick
        // the job up before this request's writes are committed.
        VerifyHiddenGemSubmission::dispatch($location->id)->afterCommit();

        return response()->json([
            'message' => 'Hidden gem submitted successfully.',
            'data' => $location->load('images'),
        ], 201);
    }

    /**
     * Return the Hidden Gems list for React frontend.
     */
    public function index(Request $request): JsonResponse
    {
        // Public listing — only AI-approved (or already community-verified) gems
        // may be discoverable; anything still awaiting/failing AI review must stay hidden.
        $query = Location::query()
            ->select(self::PUBLIC_LOCATION_COLUMNS)
            ->with([
                'user:id,name,avatar_url',
                'category:id,name',
                'images:id,location_id,image_url',
            ])
            ->withCount('votes')
            ->withAvg('ratings', 'rating')
            ->withCount(['ratings', 'checkIns']);

        // The itinerary "add stopping point" map widens the discoverable
        // (Hidden Gems list) subset to also include well-known places, but still
        // hides gems the community confirmed as permanently closed.
        if ($request->boolean('include_well_known')) {
            $query->publiclyVisible()->whereNull('permanently_closed_at');
        } else {
            $query->discoverable();
        }

        // Filter by status (hidden_gem / pending_community_vote)
        if ($request->has('status') && in_array($request->status, ['hidden_gem', 'pending_community_vote'])) {
            $query->where('status', $request->status);
        }

        // Filter by category
        if ($request->has('category') && $request->category) {
            $query->where('category_id', $request->category);
        }

        // Filter by state
        if ($request->has('state') && $request->state) {
            $query->where('state', $request->state);
        }

        // Search by place name, address, or state
        if ($request->filled('search')) {
            $search = trim($request->search);

            $query->where(function ($searchQuery) use ($search) {
                $searchQuery
                    ->where('place_name', 'ILIKE', '%'.$search.'%')
                    ->orWhere('address', 'ILIKE', '%'.$search.'%')
                    ->orWhere('state', 'ILIKE', '%'.$search.'%');
            });
        }

        // Sorting
        if ($request->has('sort') && $request->sort === 'oldest') {
            $query->orderBy('created_at', 'asc');
        } else {
            $query->orderBy('created_at', 'desc'); // default: latest first
        }

        $perPage = (int) $request->input('per_page', 12);
        $perPage = max(1, min($perPage, 500));

        $hiddenGems = $query->paginate($perPage);

        return response()->json([
            'data' => $hiddenGems->items(),
            'current_page' => $hiddenGems->currentPage(),
            'last_page' => $hiddenGems->lastPage(),
            'total' => $hiddenGems->total(),
        ]);
    }

    /**
     * Well-known places — gems the community has outgrown (promoted by the
     * well-known:promote job). Same shape as index(), its own browse list; they
     * are deliberately kept out of the Hidden Gems list itself.
     */
    public function wellKnown(Request $request): JsonResponse
    {
        $query = Location::query()
            ->select(self::PUBLIC_LOCATION_COLUMNS)
            ->with([
                'user:id,name,avatar_url',
                'category:id,name',
                'images:id,location_id,image_url',
            ])
            ->withCount('votes')
            ->withAvg('ratings', 'rating')
            ->withCount(['ratings', 'checkIns'])
            ->wellKnown();

        if ($request->filled('category')) {
            $query->where('category_id', $request->category);
        }

        if ($request->filled('state')) {
            $query->where('state', $request->state);
        }

        if ($request->filled('search')) {
            $search = trim($request->search);
            $query->where(function ($q) use ($search) {
                $q->where('place_name', 'ILIKE', '%'.$search.'%')
                    ->orWhere('address', 'ILIKE', '%'.$search.'%')
                    ->orWhere('state', 'ILIKE', '%'.$search.'%');
            });
        }

        $query->orderBy('created_at', $request->input('sort') === 'oldest' ? 'asc' : 'desc');

        $perPage = max(1, min((int) $request->input('per_page', 12), 500));
        $places = $query->paginate($perPage);

        return response()->json([
            'data' => $places->items(),
            'current_page' => $places->currentPage(),
            'last_page' => $places->lastPage(),
            'total' => $places->total(),
        ]);
    }

    public function myHiddenGems(Request $request): JsonResponse
    {
        $user = Auth::user();

        $hiddenGems = Location::with([
            'category',
            'images',
        ])
            ->withExists('votes')
            ->withExists([
                'reports as has_active_report' => fn ($query) => $query
                    ->where('status', Report::STATUS_PENDING),
            ])
            ->where('user_id', $user->id)
            ->whereNotIn('status', [Location::STATUS_DELETED, Location::STATUS_ARCHIVED])
            ->latest()
            ->get();

        $hiddenGems->each(function (Location $gem) {
            $eligibility = $this->managementEligibility($gem);
            $gem->setAttribute('can_edit', $eligibility['can_edit']);
            $gem->setAttribute('can_delete', $eligibility['can_delete']);
            $gem->setAttribute('edit_mode', $eligibility['edit_mode']);
            $gem->setAttribute('has_active_report', (bool) $gem->has_active_report);
            $gem->makeHidden('votes_exists');
        });

        return response()->json([
            'data' => $hiddenGems,
        ]);
    }

    public function myJourney(Request $request): JsonResponse
    {
        $user = $request->user();

        $locations = Location::query()
            ->select([
                'id',
                'category_id',
                'place_name',
                'state',
                'description',
                'latitude',
                'longitude',
                'status',
                'permanently_closed_at',
            ])
            ->with([
                'category:id,name',
                'firstImage' => fn ($query) => $query->select([
                    'location_images.id',
                    'location_images.location_id',
                    'location_images.image_url',
                ]),
            ])
            ->where('user_id', $user->id)
            ->whereIn('status', [
                Location::STATUS_PENDING_VOTE,
                Location::STATUS_HIDDEN_GEM,
                Location::STATUS_WELL_KNOWN,
                Location::STATUS_ARCHIVED,
            ])
            ->whereNotNull('latitude')
            ->whereNotNull('longitude')
            ->whereBetween('latitude', [-90, 90])
            ->whereBetween('longitude', [-180, 180])
            ->latest()
            ->get();

        return response()->json([
            'data' => $locations,
            'discovered_regions' => $this->specialAchievements->earnedRegions($user),
        ]);
    }

    public function updateStatus(Request $request, $id): JsonResponse
    {
        $request->validate([
            'status' => 'required|in:deleted',
        ]);

        $gem = Location::findOrFail($id);

        if ($gem->user_id !== Auth::id()) {
            return response()->json([
                'message' => 'Unauthorized',
            ], 403);
        }

        $eligibility = $this->managementEligibility($gem);

        if (! $eligibility['can_delete']) {
            return response()->json([
                'title' => 'Deletion Unavailable',
                'message' => $this->deleteUnavailableMessage($gem),
            ], 403);
        }

        $gem->status = $gem->permanently_closed_at !== null
            && in_array($gem->status, [Location::STATUS_HIDDEN_GEM, Location::STATUS_WELL_KNOWN], true)
                ? Location::STATUS_ARCHIVED
                : Location::STATUS_DELETED;
        $gem->save();

        return response()->json([
            'message' => 'Hidden gem deleted successfully',
            'data' => $gem,
        ]);
    }

    public function update(Request $request, $id): JsonResponse
    {
        $gem = Location::findOrFail($id);

        if ($gem->user_id !== Auth::id()) {
            return response()->json([
                'message' => 'Unauthorized',
            ], 403);
        }

        $eligibility = $this->managementEligibility($gem);
        $editMode = $eligibility['edit_mode'];

        if (! $eligibility['can_edit']) {
            $message = $editMode === 'delete_only'
                ? 'This place is marked permanently closed. It can no longer be edited — only deleted.'
                : 'This Hidden Gem can no longer be edited.';

            return response()->json(['message' => $message], 403);
        }

        // ---- Verified gem (pending_community_vote / hidden_gem / well_known) ----
        // Contact fields save instantly and clear the "contact info wrong" flag.
        // Description, photos and identity fields remain locked.
        if ($editMode === 'verified') {
            $editType = $request->input('edit_type', 'contact');

            if ($editType !== 'contact') {
                return response()->json([
                    'message' => 'Verified Hidden Gems can only update contact information.',
                ], 403);
            }

            $contact = $request->validate([
                'opening_hours' => 'nullable|string|max:255',
                'phone' => 'nullable|string|max:30',
                'website' => 'nullable|url|max:255',
            ]);

            $gem->update([
                'opening_hours' => $contact['opening_hours'] ?? null,
                'phone' => $contact['phone'] ?? null,
                'website' => $contact['website'] ?? null,
                'contact_flagged_at' => null,
                'contact_updated_at' => now(),
            ]);

            return response()->json([
                'message' => 'Contact information updated.',
                'data' => $gem->fresh()->load(['category', 'images']),
            ]);
        }

        // ---- 'normal' (pending / ai_rejected): a full resubmit, any field ----
        $validated = $request->validate([
            'category_id' => 'required|exists:categories,id',
            'place_name' => 'required|string|max:255',
            'address' => 'required|string|max:255',
            'state' => 'required|string|max:100',
            'postcode' => 'required|digits:5',
            'description' => 'required|string',
            'opening_hours' => 'nullable|string|max:255',
            'phone' => 'nullable|string|max:30',
            'website' => 'nullable|url|max:255',
            'latitude' => 'required|numeric',
            'longitude' => 'required|numeric',
            'images' => 'nullable|array',
            'images.*' => 'image|max:5120',
            'remove_image_ids' => 'nullable|array',
            'remove_image_ids.*' => 'integer',
        ]);

        $uploadedImageUrls = $this->uploadLocationImages($request->file('images') ?? []);
        if ($uploadedImageUrls === null) {
            return response()->json(['message' => 'Failed to upload image.'], 500);
        }

        // Drop any existing photos the owner removed. Guard: never leave the gem
        // with zero photos.
        $removeIds = $validated['remove_image_ids'] ?? [];
        if (! empty($removeIds)) {
            $keeping = $gem->images()->whereNotIn('id', $removeIds)->count();
            if ($keeping === 0 && empty($uploadedImageUrls)) {
                return response()->json([
                    'message' => 'A hidden gem needs at least one photo — add a new one before removing the last existing photo.',
                ], 422);
            }
            $gem->images()->whereIn('id', $removeIds)->delete();
        }

        unset($validated['images'], $validated['remove_image_ids']);

        // A full resubmit stamps the contact fields as freshly set.
        $validated['contact_updated_at'] = now();

        // Update hidden gem information
        $gem->update($validated);

        foreach ($uploadedImageUrls as $imageUrl) {
            LocationImage::create([
                'location_id' => $gem->id,
                'image_url' => $imageUrl,
            ]);
        }

        // Reset verification progress after editing — an edit is a full
        // resubmit and the community re-verifies from scratch.
        $gem->vote_count = 0;
        $gem->status = 'pending';
        $gem->ai_review_reason = null;
        $gem->verification_attempts = 0;
        $gem->report_status = null;
        $gem->permanently_closed_at = null;
        $gem->contact_flagged_at = null;
        $gem->save();

        // Remove previous vote records
        $gem->votes()->delete();

        // Re-run Stage 1 AI verification against the updated submission.
        VerifyHiddenGemSubmission::dispatch($gem->id)->afterCommit();

        return response()->json([
            'message' => 'Hidden gem updated successfully and is being re-verified.',
            'data' => $gem->load(['category', 'images']),
        ]);
    }

    /**
     * Display a single Hidden Gem detail.
     */
    public function show($id): JsonResponse
    {
        $location = Location::with([
            'user:id,name,avatar_url',
            'category',
            'images',
            'votes.user:id,name,avatar_url',
            'menuItems.addedBy:id,name',
        ])
            ->withAvg('ratings', 'rating')
            ->withCount(['ratings', 'checkIns'])
            ->withExists([
                'reports as has_active_report' => fn ($query) => $query
                    ->where('status', Report::STATUS_PENDING),
            ])
            ->findOrFail($id);

        $location->setAttribute('has_active_report', (bool) $location->has_active_report);

        $isPubliclyVisible = Location::isPubliclyVisible($location);
        $viewer = Auth::guard('sanctum')->user();
        $isOwner = $viewer !== null && $location->user_id === $viewer->id;

        // Deleted and archived gems are invisible to everyone, their owner
        // included. Other private stages remain owner-only.
        if (in_array($location->status, [Location::STATUS_DELETED, Location::STATUS_ARCHIVED], true)) {
            abort(404);
        }

        if (! $isPubliclyVisible && ! $isOwner) {
            abort(404);
        }

        if ($isPubliclyVisible) {
            $location->makeHidden(self::INTERNAL_LOCATION_FIELDS);
            $location->category?->setVisible(['id', 'name']);
            $location->images->each->setVisible(['id', 'image_url']);
        }

        if ($location->user) {
            $activeFavourites = $this->specialAchievements
                ->activeFavouritesForUsers([$location->user_id])
                ->get($location->user_id, []);

            $location->user->setAttribute('favourite_achievements', $activeFavourites);
        }

        // A "contact info is wrong" report that the community upheld leaves a
        // warning flag on the gem until the owner's next contact edit clears it.
        if ($location->contact_flagged_at !== null) {
            $location->setAttribute('contact_flagged', true);
        }

        if ($isOwner) {
            $eligibility = $this->managementEligibility($location);
            $location->setAttribute('can_edit', $eligibility['can_edit']);
            $location->setAttribute('can_delete', $eligibility['can_delete']);
            $location->setAttribute('edit_mode', $eligibility['edit_mode']);
            $location->setAttribute('can_edit_contact', $eligibility['can_edit_contact']);
            $location->setAttribute('can_propose_content', $eligibility['can_propose_content']);

        }

        return response()->json(['data' => $location]);
    }

    /**
     * Nearby attractions (from OpenStreetMap) around a Hidden Gem — powers the
     * "Near this gem" section shown under a gem's detail in the map panel.
     */
    public function nearby(Request $request, $id): JsonResponse
    {
        $gem = Location::findOrFail($id);

        if (! Auth::check() && ! Location::isPubliclyVisible($gem)) {
            abort(404);
        }

        $radius = (int) $request->query('radius', self::NEARBY_RADIUS_METERS);
        $radius = max(100, min(3000, $radius));

        // Unlike nearbyAttractions() below, a failure here stays silent (empty
        // list) rather than surfacing an error — this powers the "Near this gem"
        // list under a gem's own details, where that's the existing behaviour.
        try {
            $results = $this->fetchNearbyFromOverpass((float) $gem->latitude, (float) $gem->longitude, $radius);
        } catch (\Throwable $exception) {
            report($exception);
            $results = collect();
        }

        return response()->json(['data' => $results]);
    }

    public function nearbyGems(Request $request, $id): JsonResponse
    {
        $gem = Location::findOrFail($id);

        if (! Auth::check() && ! Location::isPubliclyVisible($gem)) {
            abort(404);
        }

        $radius = (int) $request->query('radius', self::NEARBY_RADIUS_METERS);
        $radius = max(100, min(3000, $radius));

        $lat = (float) $gem->latitude;
        $lng = (float) $gem->longitude;
        [$minLat, $maxLat, $minLng, $maxLng] = Geo::boundingBox($lat, $lng, $radius);

        $results = Location::query()
            ->select(['id', 'place_name', 'category_id', 'latitude', 'longitude', 'status', 'permanently_closed_at'])
            ->with('category:id,name')
            ->publiclyVisible()
            ->where('id', '!=', $gem->id)
            ->whereBetween('latitude', [$minLat, $maxLat])
            ->whereBetween('longitude', [$minLng, $maxLng])
            ->get()
            ->map(function (Location $row) use ($lat, $lng) {
                return [
                    'id' => $row->id,
                    'name' => $row->place_name,
                    'type' => $row->category?->name ?? 'Hidden gem',
                    'status' => $row->status,
                    'permanently_closed_at' => $row->permanently_closed_at,
                    'latitude' => (float) $row->latitude,
                    'longitude' => (float) $row->longitude,
                    'source' => 'database',
                    'distance' => (int) round(Geo::distanceMeters($lat, $lng, $row->latitude, $row->longitude)),
                ];
            })
            ->filter(fn (array $nearbyGem) => $nearbyGem['distance'] <= $radius)
            ->sortBy('distance')
            ->take(10)
            ->values();

        return response()->json(['data' => $results]);
    }

    public function nearbyAttractions(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'radius' => ['nullable', 'integer', 'between:100,3000'],
        ]);

        // Used by both the zoom-triggered "explore nearby" and the click-to-scan
        // toggle. Unlike nearby() above, a real Overpass failure is surfaced as an
        // error instead of an empty list — click-to-scan needs to tell "nothing
        // found" apart from "the request failed", which used to look identical.
        try {
            $results = $this->fetchNearbyFromOverpass(
                (float) $validated['latitude'],
                (float) $validated['longitude'],
                (int) ($validated['radius'] ?? self::NEARBY_RADIUS_METERS)
            );
        } catch (\Throwable $exception) {
            report($exception);

            return response()->json([
                'message' => 'Unable to reach OpenStreetMap. Please try again.',
            ], 502);
        }

        return response()->json(['data' => $results]);
    }

    /**
     * Hidden Gems within the map's current viewport. The paginated index() only
     * ever returned the first 12, so the map could never show everything in view.
     */
    public function inBounds(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'north' => ['required', 'numeric', 'between:-90,90'],
            'south' => ['required', 'numeric', 'between:-90,90'],
            'east' => ['required', 'numeric', 'between:-180,180'],
            'west' => ['required', 'numeric', 'between:-180,180'],
            'status' => ['nullable', 'in:hidden_gem,pending_community_vote'],
        ]);

        // Markers/popups only ever need one photo and the category name, not the
        // full row + every photo — this endpoint can be asked for up to 300 rows
        // on a single pan, so trimming it matters more than the other gem queries.
        $query = Location::query()
            ->select(['id', 'category_id', 'place_name', 'state', 'address', 'description', 'latitude', 'longitude', 'status', 'report_status', 'permanently_closed_at', 'vote_count', 'verification_threshold'])
            ->with([
                'category:id,name',
                // Table-qualified: the "of many" relation joins a subquery that
                // also exposes location_id, so the bare `relation:col,col`
                // shorthand is ambiguous between the two.
                'firstImage' => fn ($q) => $q->select(['location_images.id', 'location_images.location_id', 'location_images.image_url']),
            ])
            ->withAvg('ratings', 'rating')
            ->withCount(['ratings', 'checkIns'])
            ->publiclyVisible()
            ->whereBetween('latitude', [$validated['south'], $validated['north']])
            ->whereBetween('longitude', [$validated['west'], $validated['east']]);

        if (! empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        return response()->json([
            'data' => $query->limit(self::VIEWPORT_RESULT_LIMIT)->get(),
        ]);
    }

    public function search(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'query' => ['required', 'string', 'min:1', 'max:100'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'db_offset' => ['nullable', 'integer', 'min:0'],
            'osm_offset' => ['nullable', 'integer', 'min:0'],
        ]);

        return response()->json($this->hiddenGemSearch->search(
            $validated['query'],
            isset($validated['latitude']) ? (float) $validated['latitude'] : null,
            isset($validated['longitude']) ? (float) $validated['longitude'] : null,
            (int) ($validated['db_offset'] ?? 0),
            (int) ($validated['osm_offset'] ?? 0),
        ));
    }

    /** Look up latitude/longitude for a free-text address (Malaysia only). */
    public function geocode(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'query' => ['required', 'string', 'min:3', 'max:200'],
        ]);

        return $this->geocodingResponse(
            fn () => $this->geocoder->geocode($validated['query'])
        );
    }

    public function reverseGeocode(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
        ]);

        return $this->geocodingResponse(fn () => $this->geocoder->reverseStop(
            (float) $validated['latitude'],
            (float) $validated['longitude'],
        ));
    }

    public function reverseGeocodeAddress(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
        ]);

        return $this->geocodingResponse(fn () => $this->geocoder->reverseAddress(
            (float) $validated['latitude'],
            (float) $validated['longitude'],
        ));
    }

    public function addressAutocomplete(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'query' => ['required', 'string', 'min:3', 'max:150'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
        ]);

        return $this->geocodingResponse(
            fn () => ['data' => $this->geocoder->autocomplete(
                $validated['query'],
                isset($validated['latitude']) ? (float) $validated['latitude'] : null,
                isset($validated['longitude']) ? (float) $validated['longitude'] : null,
            )]
        );
    }

    private function geocodingResponse(callable $operation): JsonResponse
    {
        try {
            return response()->json($operation());
        } catch (GeocodingException $exception) {
            return response()->json(
                ['message' => $exception->getMessage()],
                $exception->status,
            );
        }
    }

    /**
     * Get categories for filter.
     */
    public function getCategories(): JsonResponse
    {
        $categories = Category::all();

        return response()->json(['data' => $categories]);
    }

    /**
     * Get states for filter.
     */
    public function getStates(): JsonResponse
    {
        $states = [
            'Johor',
            'Kuala Lumpur',
            'Penang',
            'Selangor',
            'Melaka',
            'Perak',
            'Pahang',
            'Sarawak',
            'Sabah',
            'Terengganu',
            'Kelantan',
            'Kedah',
            'Negeri Sembilan',
            'Perlis',
            'Putrajaya',
            'Labuan',
        ];

        return response()->json(['data' => $states]);
    }

    public function recent(): JsonResponse
    {
        $recentLocations = Location::query()
            ->select(self::PUBLIC_LOCATION_COLUMNS)
            ->with([
                'user:id,name,avatar_url',
                'category:id,name',
                'images:id,location_id,image_url',
            ])
            ->withCount('votes')
            ->withAvg('ratings', 'rating')
            ->withCount(['ratings', 'checkIns'])
            ->discoverable()
            ->whereNull('permanently_closed_at')
            ->latest()
            ->take(6)
            ->get();

        return response()->json($recentLocations);
    }

    public function popular(): JsonResponse
    {
        // Ranked by actual review count (votes with real rows) rather than the
        // cached vote_count column, so a stale/drifted counter can't misrank.
        $popularLocations = Location::query()
            ->select(self::PUBLIC_LOCATION_COLUMNS)
            ->with([
                'user:id,name,avatar_url',
                'category:id,name',
                'images:id,location_id,image_url',
            ])
            ->withCount('votes')
            ->withAvg('ratings', 'rating')
            ->withCount(['ratings', 'checkIns'])
            ->where('status', 'well_known')
            ->whereNull('permanently_closed_at')
            ->orderByDesc('votes_count')
            ->take(6)
            ->get();

        return response()->json($popularLocations);
    }

    /**
     * Upload gem photos to Supabase storage.
     *
     * @param  iterable<UploadedFile>  $files
     * @return array<int, string>|null public URLs, or null if any upload failed
     */
    private function uploadLocationImages(iterable $files): ?array
    {
        $urls = [];

        foreach ($files as $image) {
            $fileName = 'hidden-gems/'.uniqid().'.'.$image->getClientOriginalExtension();

            try {
                $urls[] = $this->storage->uploadPublic(
                    config('services.supabase.location_images_bucket', 'location_images'),
                    $fileName,
                    file_get_contents($image->getRealPath()),
                    $image->getMimeType(),
                );
            } catch (ObjectStorageException) {
                return null;
            }
        }

        return $urls;
    }

    /**
     * What the owner may do to their own gem. Five modes (see redesign spec §2):
     *
     *   'normal'      — pending / ai_rejected. Any field is editable; saving is a
     *                   full resubmit -> status pending, full AI re-run. Deletable.
     *   'verified'    — pending_community_vote / hidden_gem / well_known, not
     *                   closed. Contact fields (hours/phone/website) save instantly;
     *                   description, photos and identity fields are locked.
     *                   NOT deletable — the gem now belongs to the community.
     *   'delete_only' — any gem flagged permanently_closed. The owner can ONLY
     *                   delete it; no edits, no resubmit.
     *   null          — archived, deleted, or not the owner. Nothing.
     */
    private function managementEligibility(Location $gem): array
    {
        $none = [
            'can_edit' => false,
            'can_delete' => false,
            'edit_mode' => null,
            'can_edit_contact' => false,
            'can_propose_content' => false,
        ];

        if (in_array($gem->status, [Location::STATUS_DELETED, Location::STATUS_ARCHIVED], true)) {
            return $none;
        }

        if ($gem->permanently_closed_at !== null) {
            return array_merge($none, [
                'can_delete' => true,
                'edit_mode' => 'delete_only',
            ]);
        }

        if (in_array($gem->status, [Location::STATUS_PENDING, Location::STATUS_AI_REJECTED], true)) {
            return [
                'can_edit' => true,
                'can_delete' => true,
                'edit_mode' => 'normal',
                'can_edit_contact' => true,
                'can_propose_content' => false,
            ];
        }

        if ($gem->isVerified()) {
            return [
                'can_edit' => true,
                'can_delete' => false,
                'edit_mode' => 'verified',
                'can_edit_contact' => true,
                'can_propose_content' => false,
            ];
        }

        return $none;
    }

    private function deleteUnavailableMessage(Location $gem): string
    {
        if (in_array($gem->status, [Location::STATUS_DELETED, Location::STATUS_ARCHIVED], true)) {
            return 'This Hidden Gem has already been deleted.';
        }

        if ($gem->isVerified()) {
            return 'A verified place can no longer be deleted by its owner — it now belongs to the community.';
        }

        return 'This Hidden Gem can no longer be deleted.';
    }

    // ==================== PRIVATE METHODS ====================

    /**
     * Nearby attractions around a point — delegates to OsmAttractionCache,
     * which serves from the local osm_attractions cache whenever possible and
     * only falls back to a live Overpass call for a never-synced/stale cell.
     * Lets failures propagate so callers can decide whether a failure should
     * look like "nothing found" or be surfaced distinctly — see nearby() vs
     * nearbyAttractions() above.
     */
    private function fetchNearbyFromOverpass(float $lat, float $lng, ?int $radius = null): Collection
    {
        return $this->attractionCache->nearby($lat, $lng, $radius ?? self::NEARBY_RADIUS_METERS);
    }
}
