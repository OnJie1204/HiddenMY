<?php

namespace App\Http\Controllers;

use App\Jobs\VerifyHiddenGemSubmission;
use App\Models\Location;
use App\Models\Category;
use App\Models\LocationImage;
use App\Models\Report;
use App\Services\OsmAttractionCache;
use App\Services\SpecialAchievementService;
use App\Support\Geo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
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

    private const SEARCH_RESULT_LIMIT = 20;

    /** Max address suggestions returned to the Submit / Edit form's type-ahead. */
    private const ADDRESS_SUGGESTION_LIMIT = 6;

    /** The 16 values the submit form's state <select> accepts. A geocoded state
     *  that doesn't map to one of these is returned blank so the user picks it. */
    private const MALAYSIA_STATES = [
        'Johor', 'Kuala Lumpur', 'Penang', 'Selangor', 'Melaka', 'Perak', 'Pahang',
        'Sarawak', 'Sabah', 'Terengganu', 'Kelantan', 'Kedah', 'Negeri Sembilan',
        'Perlis', 'Putrajaya', 'Labuan',
    ];

    /** Nominatim's own documented hard cap on `limit` — asking for more does nothing. */
    private const OSM_SEARCH_FETCH_LIMIT = 50;

    private const OSM_CACHE_TTL_HOURS = 6;

    private const NEARBY_RADIUS_METERS = 1500;

    private const VIEWPORT_RESULT_LIMIT = 300;

    public function __construct(private SpecialAchievementService $specialAchievements)
    {
    }

    // Roughly +/-55km, used to softly bias OSM results toward the user's location.
    private const NEARBY_VIEWBOX_DEGREES = 0.5;

    // ==================== API METHODS ====================
    public function store(Request $request): JsonResponse
    {
        if (!Auth::check()) {
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
            'images.*' => 'image|max:5120'
        ]);

        $existingLocation = Location::where('place_name', $request->place_name)
            ->where('address', $request->address)
            ->where('status', '!=', 'deleted')
            ->first();

        if ($existingLocation) {
            return response()->json([
                'message' => 'This location already exists.'
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
            'latitude' => $request->latitude,
            'longitude' => $request->longitude,
            'status' => 'pending',
            'vote_count' => 0,
            'verification_threshold' => 10,
        ]);

        // Upload images to local storage
        if ($request->hasFile('images')) {

            foreach ($request->file('images') as $image) {

                $fileName = 'hidden-gems/' . uniqid() . '.' . $image->getClientOriginalExtension();

                $response = Http::withHeaders([
                    'Authorization' => 'Bearer ' . env('SUPABASE_KEY'),
                    'apikey' => env('SUPABASE_KEY'),
                    'Content-Type' => $image->getMimeType(),
                ])->withBody(
                    file_get_contents($image->getRealPath()),
                    $image->getMimeType()
                )->post(
                    env('SUPABASE_URL') . '/storage/v1/object/location_images/' . $fileName
                );

                if ($response->failed()) {
                    // Undo the just-created Location (cascades to any images
                    // already attached) so a failed submission never leaves a
                    // stuck, undispatched 'pending' row behind — otherwise the
                    // user can't even resubmit, since it collides with the
                    // duplicate place_name+address check above.
                    $location->delete();

                    return response()->json([
                        'message' => 'Failed to upload image.',
                        'error' => $response->json()
                    ], 500);
                }

                $imageUrl = env('SUPABASE_URL')
                    . '/storage/v1/object/public/location_images/'
                    . $fileName;

                LocationImage::create([
                    'location_id' => $location->id,
                    'image_url' => $imageUrl
                ]);
            }
        }

        // afterCommit(): when the queue is not 'sync' the worker must not pick
        // the job up before this request's writes are committed.
        VerifyHiddenGemSubmission::dispatch($location->id)->afterCommit();

        return response()->json([
            'message' => 'Hidden gem submitted successfully.',
            'data' => $location->load('images')
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
            ->withCount('ratings')
            ->publiclyVisible();

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
                    ->where('place_name', 'ILIKE', '%' . $search . '%')
                    ->orWhere('address', 'ILIKE', '%' . $search . '%')
                    ->orWhere('state', 'ILIKE', '%' . $search . '%');
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

    public function myHiddenGems(Request $request): JsonResponse
    {
        $user = Auth::user();

        $hiddenGems = Location::with([
            'category',
            'images'
        ])
        ->withExists('votes')
        ->where('user_id', $user->id)
        ->where('status', '!=', 'deleted')
        ->latest()
        ->get();

        $hiddenGems->each(function (Location $gem) {
            $eligibility = $this->managementEligibility($gem);
            $gem->setAttribute('can_edit', $eligibility['can_edit']);
            $gem->setAttribute('can_delete', $eligibility['can_delete']);
            $gem->setAttribute('edit_mode', $eligibility['edit_mode']);
            $gem->makeHidden('votes_exists');
        });

        return response()->json([
            'data' => $hiddenGems
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
                'message' => 'Unauthorized'
            ], 403);
        }

        $eligibility = $this->managementEligibility($gem);

        if (! $eligibility['can_delete']) {
            return response()->json([
                'title' => 'Deletion Unavailable',
                'message' => $this->deleteUnavailableMessage($gem),
            ], 403);
        }

        $gem->status = 'deleted';
        $gem->save();

        return response()->json([
            'message' => 'Hidden gem deleted successfully',
            'data' => $gem
        ]);
    }

    public function update(Request $request, $id): JsonResponse
    {
        $gem = Location::findOrFail($id);

        if ($gem->user_id !== Auth::id()) {
            return response()->json([
                'message' => 'Unauthorized'
            ], 403);
        }

        $eligibility = $this->managementEligibility($gem);
        $editMode = $eligibility['edit_mode'];

        if (! $eligibility['can_edit']) {
            if ($gem->permanently_closed_at !== null) {
                return response()->json([
                    'message' => 'This gem is marked permanently closed and can no longer be edited or deleted.'
                ], 403);
            }

            if ($gem->status === 'hidden_gem') {
                return response()->json([
                    'message' => 'Verified Hidden Gems can no longer be edited.'
                ], 403);
            }

            if ($gem->votes()->exists()) {
                return response()->json([
                    'message' => 'This Hidden Gem can no longer be edited because voting has started.'
                ], 403);
            }

            return response()->json([
                'message' => 'This hidden gem can no longer be edited.'
            ], 403);
        }

        // A community-confirmed "contact info is wrong" report unlocks this
        // one-off edit: the owner may fix ONLY the contact fields, and the gem
        // keeps its verified status, its votes and its AI review — none of the
        // normal re-verification reset below runs.
        if ($editMode === 'contact_only') {
            $contact = $request->validate([
                'opening_hours' => 'nullable|string|max:255',
                'phone' => 'nullable|string|max:30',
                'website' => 'nullable|url|max:255',
            ]);

            $gem->update([
                'opening_hours' => $contact['opening_hours'] ?? null,
                'phone' => $contact['phone'] ?? null,
                'website' => $contact['website'] ?? null,
                'contact_edit_unlocked_at' => null,
            ]);

            return response()->json([
                'message' => 'Contact information updated.',
                'data' => $gem->fresh()->load(['category', 'images']),
            ]);
        }

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
        ]);

        $uploadedImageUrls = [];

        if ($request->hasFile('images')) {
            foreach ($request->file('images') as $image) {
                $fileName = 'hidden-gems/' . uniqid() . '.' . $image->getClientOriginalExtension();

                $response = Http::withHeaders([
                    'Authorization' => 'Bearer ' . env('SUPABASE_KEY'),
                    'apikey' => env('SUPABASE_KEY'),
                    'Content-Type' => $image->getMimeType(),
                ])->withBody(
                    file_get_contents($image->getRealPath()),
                    $image->getMimeType()
                )->post(
                    env('SUPABASE_URL') . '/storage/v1/object/location_images/' . $fileName
                );

                if ($response->failed()) {
                    return response()->json([
                        'message' => 'Failed to upload image.',
                        'error' => $response->json()
                    ], 500);
                }

                $uploadedImageUrls[] = env('SUPABASE_URL')
                    . '/storage/v1/object/public/location_images/'
                    . $fileName;
            }
        }

        unset($validated['images']);

        // Update hidden gem information
        $gem->update($validated);

        foreach ($uploadedImageUrls as $imageUrl) {
            LocationImage::create([
                'location_id' => $gem->id,
                'image_url' => $imageUrl
            ]);
        }

        // Reset verification progress after editing — an edit is a full
        // resubmit, including for a permanently-closed gem the owner is
        // reviving (the "permanently closed" and any report flags are cleared
        // and the community re-verifies from scratch).
        $gem->vote_count = 0;
        $gem->status = 'pending';
        $gem->ai_review_reason = null;
        $gem->verification_attempts = 0;
        $gem->report_status = null;
        $gem->permanently_closed_at = null;
        $gem->contact_edit_unlocked_at = null;
        $gem->save();

        // Remove previous vote records
        $gem->votes()->delete();

        // Re-run Stage 1 AI verification against the updated submission.
        VerifyHiddenGemSubmission::dispatch($gem->id)->afterCommit();

        return response()->json([
            'message' => 'Hidden gem updated successfully and is being re-verified.',
            'data' => $gem->load(['category', 'images'])
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
                            ->withCount('ratings')
                            ->findOrFail($id);

        $isPubliclyVisible = Location::isPubliclyVisible($location);
        $viewer = Auth::guard('sanctum')->user();
        $isOwner = $viewer !== null && $location->user_id === $viewer->id;

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

        // An inappropriate_content report's corrections are shown to everyone
        // under the current info on the detail page — while it's under review
        // ("proposed"), and after it's upheld ("confirmed") until the owner
        // applies or resubmits it (contact_edit_unlocked_at is cleared then).
        $fixReport = $this->activeContentReport($location);
        $showFix = $fixReport
            && $fixReport->hasSuggestedFix()
            && ($location->report_status === 'under_review' || $location->contact_edit_unlocked_at !== null);
        if ($showFix) {
            $location->setAttribute('suggested_fix', [
                'state' => $fixReport->status === 'pending' ? 'under_review' : 'confirmed',
                'opening_hours' => $fixReport->suggested_opening_hours,
                'phone' => $fixReport->suggested_phone,
                'website' => $fixReport->suggested_website,
                'description' => $fixReport->suggested_description,
                'latitude' => $fixReport->suggested_latitude,
                'longitude' => $fixReport->suggested_longitude,
            ]);
        }

        if ($isOwner) {
            $eligibility = $this->managementEligibility($location);
            $location->setAttribute('can_edit', $eligibility['can_edit']);
            $location->setAttribute('can_delete', $eligibility['can_delete']);
            $location->setAttribute('edit_mode', $eligibility['edit_mode']);

            if ($eligibility['edit_mode'] === 'contact_only' && $fixReport) {
                $location->setAttribute('contact_edit_context', [
                    'suggested_opening_hours' => $fixReport->suggested_opening_hours,
                    'suggested_phone' => $fixReport->suggested_phone,
                    'suggested_website' => $fixReport->suggested_website,
                    'description' => $fixReport->description,
                ]);
            }
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

        if (!Auth::check() && !Location::isPubliclyVisible($gem)) {
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

        if (!Auth::check() && !Location::isPubliclyVisible($gem)) {
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
            ->withCount('ratings')
            ->publiclyVisible()
            ->whereBetween('latitude', [$validated['south'], $validated['north']])
            ->whereBetween('longitude', [$validated['west'], $validated['east']]);

        if (!empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        return response()->json([
            'data' => $query->limit(self::VIEWPORT_RESULT_LIMIT)->get(),
        ]);
    }

    public function search(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'query' => ['required', 'string', 'min:2', 'max:100'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'db_offset' => ['nullable', 'integer', 'min:0'],
            'osm_offset' => ['nullable', 'integer', 'min:0'],
        ]);

        $query = trim($validated['query']);
        $latitude = isset($validated['latitude']) ? (float) $validated['latitude'] : null;
        $longitude = isset($validated['longitude']) ? (float) $validated['longitude'] : null;
        $dbOffset = (int) ($validated['db_offset'] ?? 0);
        $osmOffset = (int) ($validated['osm_offset'] ?? 0);

        if ($query === '') {
            return response()->json([
                'database' => [],
                'openStreetMap' => [],
                'nextDbOffset' => 0,
                'nextOsmOffset' => 0,
                'hasMore' => false,
            ]);
        }

        // Hidden Gems are always searched and displayed first, regardless of location.
        $databaseQuery = Location::query()
            ->publiclyVisible()
            ->where(function ($q) use ($query) {
                $q->where('place_name', 'ILIKE', '%'.$query.'%')
                ->orWhere('state', 'ILIKE', '%'.$query.'%');
            });

        $totalDatabaseMatches = (clone $databaseQuery)->count();

        $databaseLocations = $databaseQuery
            ->select(['id', 'place_name', 'state', 'latitude', 'longitude', 'status', 'permanently_closed_at'])
            ->orderBy('place_name')
            ->skip($dbOffset)
            ->limit(self::SEARCH_RESULT_LIMIT)
            ->get()
            ->map(fn (Location $location) => $this->locationSearchResult($location));

        $nextDbOffset = $dbOffset + $databaseLocations->count();
        $hasMoreDatabase = $nextDbOffset < $totalDatabaseMatches;

        $remainingResults = self::SEARCH_RESULT_LIMIT - $databaseLocations->count();
        $openStreetMapLocations = collect();
        $nextOsmOffset = $osmOffset;
        $hasMoreOsm = false;

        if ($remainingResults > 0) {
            // Only OSM results are affected by the optional user location: when present,
            // they're fetched with a nearby bias and sorted by distance.
            $allOsmMatches = $this->searchOpenStreetMap($query, $latitude, $longitude);

            $openStreetMapLocations = $allOsmMatches->slice($osmOffset, $remainingResults)->values();
            $nextOsmOffset = $osmOffset + $openStreetMapLocations->count();
            $hasMoreOsm = $nextOsmOffset < $allOsmMatches->count();
        }

        return response()->json([
            'database' => $databaseLocations,
            'openStreetMap' => $openStreetMapLocations,
            'nextDbOffset' => $nextDbOffset,
            'nextOsmOffset' => $nextOsmOffset,
            'hasMore' => $hasMoreDatabase || $hasMoreOsm,
        ]);
    }

    /**
     * Look up latitude/longitude for a free-text address (Malaysia only).
     */
    public function geocode(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'query' => ['required', 'string', 'min:3', 'max:200'],
        ]);

        try {
            $results = Http::acceptJson()
                ->withUserAgent(config('app.name', 'Gemora').' hidden gem address geocoder')
                ->timeout(5)
                ->get('https://nominatim.openstreetmap.org/search', [
                    'q' => trim($validated['query']),
                    'format' => 'jsonv2',
                    'limit' => 1,
                    'countrycodes' => 'my',
                    'addressdetails' => 1,
                ])
                ->throw()
                ->json();
        } catch (\Throwable $exception) {
            report($exception);

            return response()->json([
                'message' => 'Unable to identify this location. Please try again.'
            ], 502);
        }

        $match = $results[0] ?? null;

        if (! $match) {
            return response()->json(['message' => 'No matching location found.'], 404);
        }

        $addressDetails = $match['address'] ?? [];

        $state = $addressDetails['state']
            ?? $addressDetails['region']
            ?? '';

        $stateAliases = [
            'Pulau Pinang' => 'Penang',
            'Wilayah Persekutuan Kuala Lumpur' => 'Kuala Lumpur',
            'Federal Territory of Kuala Lumpur' => 'Kuala Lumpur',
            'Wilayah Persekutuan Putrajaya' => 'Putrajaya',
            'Federal Territory of Putrajaya' => 'Putrajaya',
            'Wilayah Persekutuan Labuan' => 'Labuan',
            'Federal Territory of Labuan' => 'Labuan',
        ];

        $state = $stateAliases[$state] ?? $state;

        $specificAddressFields = [
            'house_number',
            'road',
            'pedestrian',
            'footway',
            'path',
            'residential',
            'neighbourhood',
            'suburb',
            'quarter',
        ];

        $isSpecific = collect($specificAddressFields)->contains(
            fn (string $field) => !empty($addressDetails[$field])
        );

        return response()->json([
            'latitude' => (float) $match['lat'],
            'longitude' => (float) $match['lon'],
            'name' => $match['display_name'],
            'state' => $state,
            'postcode' => $addressDetails['postcode'] ?? '',
            'country_code' => $addressDetails['country_code'] ?? '',
            'is_specific' => $isSpecific,
        ]);
    }

    public function reverseGeocode(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
        ]);

        $latitude = (float) $validated['latitude'];
        $longitude = (float) $validated['longitude'];

        $cacheKey = 'osm-reverse:'.md5(round($latitude, 5).':'.round($longitude, 5));

        $cached = Cache::get($cacheKey);
        if ($cached !== null) {
            return response()->json($cached);
        }

        try {
            $result = Http::acceptJson()
                ->withUserAgent(config('app.name', 'HiddenMY').' location search')
                ->timeout(5)
                ->get('https://nominatim.openstreetmap.org/reverse', [
                    'lat' => $latitude,
                    'lon' => $longitude,
                    'format' => 'jsonv2',
                    'addressdetails' => 1,
                ])
                ->throw()
                ->json();
        } catch (\Throwable $exception) {
            report($exception);

            return response()->json(['message' => 'Unable to identify a location at this point. Please try again.'], 502);
        }

        if (empty($result['osm_id']) || empty($result['display_name'])) {
            return response()->json(['message' => 'No location found at this point. Try clicking closer to a road or landmark.'], 404);
        }

        // The map's bounding box is a loose rectangle, so points that are near
        // Malaysia (southern Thailand, Singapore, Brunei, Kalimantan) can still
        // be clicked. Trust the resolved address's country to keep stops inside
        // Malaysia even right at the border.
        if (strtolower($result['address']['country_code'] ?? '') !== 'my') {
            return response()->json([
                'message' => 'That point is outside Malaysia. Please pick a location within the country.',
            ], 422);
        }

        $location = [
            'id' => 'osm-'.($result['osm_type'] ?? 'node').'-'.$result['osm_id'],
            'osm_id' => (int) $result['osm_id'],
            'name' => $result['display_name'],
            'latitude' => $latitude,
            'longitude' => $longitude,
            'source' => 'openstreetmap',
        ];

        Cache::put($cacheKey, $location, now()->addHours(self::OSM_CACHE_TTL_HOURS));

        return response()->json($location);
    }

    public function reverseGeocodeAddress(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
        ]);

        $latitude = (float) $validated['latitude'];
        $longitude = (float) $validated['longitude'];

        try {
            $result = Http::acceptJson()
                ->withUserAgent(config('app.name', 'Gemora').' hidden gem location picker')
                ->timeout(5)
                ->get('https://nominatim.openstreetmap.org/reverse', [
                    'lat' => $latitude,
                    'lon' => $longitude,
                    'format' => 'jsonv2',
                    'addressdetails' => 1,
                ])
                ->throw()
                ->json();

        } catch (\Throwable $exception) {
            report($exception);

            return response()->json([
                'message' => 'Unable to identify this location. Please try again.'
            ], 502);
        }

        if (empty($result['display_name'])) {
            return response()->json([
                'message' => 'No address found for this location.'
            ], 404);
        }

        $addressDetails = $result['address'] ?? [];

        $state = $addressDetails['state']
            ?? $addressDetails['region']
            ?? '';

        $stateAliases = [
            'Pulau Pinang' => 'Penang',
            'Wilayah Persekutuan Kuala Lumpur' => 'Kuala Lumpur',
            'Federal Territory of Kuala Lumpur' => 'Kuala Lumpur',
            'Wilayah Persekutuan Putrajaya' => 'Putrajaya',
            'Federal Territory of Putrajaya' => 'Putrajaya',
            'Wilayah Persekutuan Labuan' => 'Labuan',
            'Federal Territory of Labuan' => 'Labuan',
        ];

        $state = $stateAliases[$state] ?? $state;

        $postcode = $addressDetails['postcode'] ?? '';

        $road = $addressDetails['road']
            ?? $addressDetails['pedestrian']
            ?? $addressDetails['footway']
            ?? $addressDetails['path']
            ?? $addressDetails['residential']
            ?? '';

        $street = trim(($addressDetails['house_number'] ?? '') . ' ' . $road);

        $area = $addressDetails['neighbourhood']
            ?? $addressDetails['suburb']
            ?? $addressDetails['quarter']
            ?? '';

        $locality = $addressDetails['city']
            ?? $addressDetails['town']
            ?? $addressDetails['village']
            ?? $addressDetails['municipality']
            ?? '';

        $addressParts = [];
        $seenAddressParts = [];

        foreach ([$street, $area, $locality] as $part) {
            $part = trim($part);
            $normalizedPart = strtolower($part);

            if ($part !== '' && !in_array($normalizedPart, $seenAddressParts, true)) {
                $addressParts[] = $part;
                $seenAddressParts[] = $normalizedPart;
            }
        }

        $address = implode(', ', $addressParts);

        return response()->json([
            'address' => $address,
            'state' => $state,
            'postcode' => $postcode,
            'latitude' => $latitude,
            'longitude' => $longitude,
        ]);
    }

    /**
     * Live address suggestions for the "Submit a Hidden Gem" form's type-ahead.
     *
     * Backed by Photon (photon.komoot.io) — an OpenStreetMap-based geocoder
     * built for autocomplete (prefix matching), unlike Nominatim which the
     * rest of this controller uses for one-shot lookups. Free, no API key.
     * Results are filtered to Malaysia and normalised into exactly the fields
     * the form needs: address / state / postcode / latitude / longitude.
     */
    public function addressAutocomplete(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'query' => ['required', 'string', 'min:3', 'max:150'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
        ]);

        $query = trim($validated['query']);
        $cacheKey = 'photon-autocomplete:'.md5(strtolower($query));

        $cached = Cache::get($cacheKey);
        if ($cached !== null) {
            return response()->json(['data' => $cached]);
        }

        // Bias ranking toward the pin the user has already placed, else toward
        // peninsular Malaysia's rough centre so local results surface first.
        $latitude = isset($validated['latitude']) ? (float) $validated['latitude'] : 4.2;
        $longitude = isset($validated['longitude']) ? (float) $validated['longitude'] : 102.0;

        try {
            $features = Http::acceptJson()
                ->withUserAgent(config('app.name', 'HiddenMY').' address autocomplete')
                ->timeout(5)
                ->get(rtrim((string) config('services.photon.url'), '/').'/api', [
                    'q' => $query,
                    'lang' => 'en',
                    'limit' => 15, // over-fetch, then filter to MY and trim
                    'lat' => $latitude,
                    'lon' => $longitude,
                ])
                ->throw()
                ->json('features', []);
        } catch (\Throwable $exception) {
            report($exception);

            return response()->json([
                'message' => 'Address lookup is unavailable right now. You can still type the address and use the map.',
            ], 502);
        }

        $suggestions = collect($features)
            ->filter(fn ($feature) => strtoupper((string) data_get($feature, 'properties.countrycode')) === 'MY')
            ->map(fn ($feature) => $this->normalisePhotonFeature($feature))
            ->filter(fn ($s) => $s['latitude'] !== null && $s['longitude'] !== null && $s['label'] !== '')
            ->unique('label')
            ->take(self::ADDRESS_SUGGESTION_LIMIT)
            ->values()
            ->all();

        Cache::put($cacheKey, $suggestions, now()->addHours(6));

        return response()->json(['data' => $suggestions]);
    }

    /**
     * Turn one Photon GeoJSON feature into the flat shape the form consumes.
     */
    private function normalisePhotonFeature(array $feature): array
    {
        $props = $feature['properties'] ?? [];
        $coordinates = $feature['geometry']['coordinates'] ?? [null, null];

        $name = trim((string) ($props['name'] ?? ''));
        $street = trim(implode(' ', array_filter([
            $props['housenumber'] ?? null,
            $props['street'] ?? null,
        ])));

        // Lead with the POI name when it isn't already the street (e.g. a
        // café or a kampung waterfall), otherwise the street line alone.
        if ($name !== '' && ($street === '' || stripos($street, $name) === false)) {
            $street = trim($name.($street !== '' ? ', '.$street : ''));
        }

        $locality = trim((string) (
            $props['district']
            ?? $props['city']
            ?? $props['county']
            ?? $props['locality']
            ?? ''
        ));

        // Photon usually gives `state`, but the three federal territories
        // (Kuala Lumpur, Putrajaya, Labuan) come through as `city`/`county`
        // with no `state` — fall back through those so the form's state
        // dropdown still auto-fills.
        $state = $this->canonicalMalaysiaState($props['state'] ?? '')
            ?: $this->canonicalMalaysiaState($props['county'] ?? '')
            ?: $this->canonicalMalaysiaState($props['city'] ?? '');

        $postcode = trim((string) ($props['postcode'] ?? ''));

        $address = trim(implode(', ', array_filter([$street, $locality])));
        if ($address === '') {
            $address = $locality !== '' ? $locality : ($name !== '' ? $name : $state);
        }

        $label = trim(implode(', ', array_filter([$address, $state, $postcode])), ', ');

        return [
            'label' => $label,
            'address' => $address,
            'state' => $state,
            'postcode' => $postcode,
            'latitude' => isset($coordinates[1]) ? (float) $coordinates[1] : null,
            'longitude' => isset($coordinates[0]) ? (float) $coordinates[0] : null,
        ];
    }

    /**
     * Normalise a geocoder's state name (Malay / English / federal-territory
     * variants) to one of the 16 values the form's <select> accepts, or '' if
     * it doesn't map to one.
     */
    private function canonicalMalaysiaState(?string $state): string
    {
        $state = trim((string) $state);

        $aliases = [
            'Pulau Pinang' => 'Penang',
            'Penang Island' => 'Penang',
            'Malacca' => 'Melaka',
            'Malacca City' => 'Melaka',
            'Wilayah Persekutuan Kuala Lumpur' => 'Kuala Lumpur',
            'Federal Territory of Kuala Lumpur' => 'Kuala Lumpur',
            'Kuala Lumpur Federal Territory' => 'Kuala Lumpur',
            'Wilayah Persekutuan Putrajaya' => 'Putrajaya',
            'Federal Territory of Putrajaya' => 'Putrajaya',
            'Wilayah Persekutuan Labuan' => 'Labuan',
            'Federal Territory of Labuan' => 'Labuan',
            'Negeri Sembilan Darul Khusus' => 'Negeri Sembilan',
        ];

        $state = $aliases[$state] ?? $state;

        return in_array($state, self::MALAYSIA_STATES, true) ? $state : '';
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
            'Labuan'
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
            ->withCount('ratings')
            ->publiclyVisible()
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
            ->withCount('ratings')
            ->where('status', 'hidden_gem')
            ->orderByDesc('votes_count')
            ->take(6)
            ->get();

        return response()->json($popularLocations);
    }

    private function managementEligibility(Location $gem): array
    {
        $hasVotes = array_key_exists('votes_exists', $gem->getAttributes())
            ? (bool) $gem->getAttribute('votes_exists')
            : $gem->votes()->exists();
        $normalStatus = in_array($gem->status, ['pending', 'ai_rejected', 'pending_community_vote'], true);
        // The owner of a verified Hidden Gem can always keep its contact fields
        // (hours / phone / website) current — this NEVER resets verification or
        // votes. Frozen only when the gem is permanently closed or while a
        // report on it is being voted on.
        $contactOnly = $gem->status === 'hidden_gem'
            && $gem->permanently_closed_at === null
            && $gem->report_status !== 'under_review';
        // A community-confirmed inappropriate_content report on a gem still in
        // community voting unlocks a full edit (resubmit) even though it has
        // votes (see ReportController + update()).
        $votingFixUnlocked = $gem->status === 'pending_community_vote'
            && $gem->contact_edit_unlocked_at !== null;

        if ($gem->permanently_closed_at !== null) {
            // A gem confirmed permanently closed while still in community
            // voting can be revived (full resubmit) or deleted by its owner,
            // even though it has votes. A closed *verified* Hidden Gem is
            // fully frozen — greyed out, no owner action.
            $canResubmit = $gem->status === 'pending_community_vote';
        } else {
            $canResubmit = $votingFixUnlocked || ($normalStatus && ! $hasVotes);
        }

        return [
            'can_edit' => $contactOnly || $canResubmit,
            'can_delete' => $canResubmit,
            'edit_mode' => $contactOnly ? 'contact_only' : ($canResubmit ? 'normal' : null),
        ];
    }

    /**
     * The inappropriate_content report currently driving the detail page —
     * the one under community review, or (once resolved) the upheld one whose
     * fix the owner hasn't applied yet.
     */
    private function activeContentReport(Location $gem): ?Report
    {
        return $gem->reports()
            ->where('reason', 'inappropriate_content')
            ->whereIn('status', ['pending', 'upheld'])
            ->latest('id')
            ->first();
    }

    private function deleteUnavailableMessage(Location $gem): string
    {
        if ($gem->permanently_closed_at !== null) {
            return 'This gem is marked permanently closed and can no longer be edited or deleted.';
        }

        if ($gem->status === 'hidden_gem') {
            return 'Verified Hidden Gems can no longer be deleted.';
        }

        if (! in_array($gem->status, ['pending', 'ai_rejected', 'pending_community_vote'], true)) {
            return 'This Hidden Gem can no longer be deleted.';
        }

        if ($gem->votes()->exists()) {
            return 'This Hidden Gem can no longer be deleted because community voting has started.';
        }

        return 'This Hidden Gem can no longer be deleted.';
    }

    // ==================== PRIVATE METHODS ====================

    private function searchOpenStreetMap(
        string $query,
        ?float $latitude = null,
        ?float $longitude = null
    ): Collection {
        $cacheKey = 'osm-search:'.md5($query.':'.($latitude ?? 'x').':'.($longitude ?? 'x'));

        $cached = Cache::get($cacheKey);
        if ($cached !== null) {
            return $cached;
        }

        try {
            $results = $this->fetchFromNominatim($query, $latitude, $longitude);
            Cache::put($cacheKey, $results, now()->addHours(self::OSM_CACHE_TTL_HOURS));

            return $results;
        } catch (\Throwable $exception) {
            report($exception);

            return collect(); // not cached — next request will retry Nominatim
        }
    }

    private function fetchFromNominatim(string $query, ?float $latitude = null, ?float $longitude = null): Collection
    {
        $hasLocation = $latitude !== null && $longitude !== null;

        $params = [
            'q' => $query,
            'format' => 'jsonv2',
            'limit' => self::OSM_SEARCH_FETCH_LIMIT,
            'countrycodes' => 'my', // Restrict search to Malaysia
        ];

        if ($hasLocation) {
            $radius = self::NEARBY_VIEWBOX_DEGREES;
            // Soft bias (bounded=0) toward the viewbox around the user without excluding results outside it.
            $params['viewbox'] = ($longitude - $radius).','.($latitude + $radius).','.($longitude + $radius).','.($latitude - $radius);
            $params['bounded'] = 0;
        }

        $results = collect(
            Http::acceptJson()
                ->withUserAgent(config('app.name', 'HiddenMY').' location search')
                ->timeout(5)
                ->get('https://nominatim.openstreetmap.org/search', $params)
                ->throw()
                ->json()
        )->map(fn (array $location) => [
            'id' => 'osm-'.$location['osm_type'].'-'.$location['osm_id'],
            'osm_id' => (int) $location['osm_id'],
            'name' => $location['display_name'],
            'latitude' => (float) $location['lat'],
            'longitude' => (float) $location['lon'],
            'source' => 'openstreetmap',
        ]);

        if ($hasLocation) {
            $results = $results
                ->sortBy(fn (array $location) => $this->distanceInKm($latitude, $longitude, $location['latitude'], $location['longitude']))
                ->values();
        }

        return $results;
    }

    private function distanceInKm(float $lat1, float $lon1, float $lat2, float $lon2): float
    {
        return Geo::distanceMeters($lat1, $lon1, $lat2, $lon2) / 1000;
    }

    private function locationSearchResult(Location $location): array
    {
        return [
            'id' => $location->id,
            'name' => $location->place_name,
            'state' => $location->state,
            'latitude' => $location->latitude,
            'longitude' => $location->longitude,
            'status' => $location->status,
            'permanently_closed_at' => $location->permanently_closed_at,
            'source' => 'database',
        ];
    }

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
        return app(OsmAttractionCache::class)->nearby($lat, $lng, $radius ?? self::NEARBY_RADIUS_METERS);
    }
}
