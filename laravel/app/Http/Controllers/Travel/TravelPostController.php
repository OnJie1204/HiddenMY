<?php

namespace App\Http\Controllers\Travel;

use App\Contracts\ObjectStorage;
use App\Http\Controllers\Controller;
use App\Integrations\Storage\ObjectStorageException;
use App\Models\CheckIn;
use App\Models\Location;
use App\Models\PostImage;
use App\Models\PostStop;
use App\Models\TravelPost;
use App\Models\TripItinerary;
use App\Models\TripLocation;
use App\Services\Achievements\SpecialAchievementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class TravelPostController extends Controller
{
    /**
     * Statuses a gem stop may have when it is added to a post's snapshot.
     * A stop whose gem is later closed or deleted stays in the snapshot with a
     * badge — this only gates what can be freshly tagged.
     */
    private const TAGGABLE_STATUSES = ['hidden_gem', 'well_known', 'pending_community_vote'];

    private const RELATIONS = ['user', 'images', 'locations', 'stops.location.category', 'stops.location.images', 'stops.sourceItinerary:id,trip_name'];

    /** Columns exposed for a tagged gem in the post_locations mirror. */
    private const PUBLIC_LOCATION_COLUMNS = [
        'locations.id',
        'locations.category_id',
        'locations.place_name',
        'locations.address',
        'locations.state',
        'locations.description',
        'locations.latitude',
        'locations.longitude',
        'locations.status',
        'locations.report_status',
        'locations.permanently_closed_at',
        'locations.vote_count',
        'locations.verification_threshold',
    ];

    public function __construct(
        private SpecialAchievementService $specialAchievements,
        private ObjectStorage $storage,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = TravelPost::with($this->publicRelations())->latest();

        if ($request->filled('state')) {
            $query->whereHas('locations', fn ($q) => $q->where('state', $request->state));
        }

        if ($request->filled('category')) {
            $query->whereHas('locations', fn ($q) => $q->where('category_id', $request->category));
        }

        return response()->json(['data' => $this->present($this->includeAuthorFavourites($query->get()))]);
    }

    public function show($id): JsonResponse
    {
        $post = TravelPost::with($this->publicRelations())->find($id);

        if (! $post) {
            return response()->json(['message' => 'Travel post not found.'], 404);
        }

        return response()->json(['data' => $this->present($this->includeAuthorFavourites($post))]);
    }

    public function myPosts(): JsonResponse
    {
        $posts = TravelPost::with(self::RELATIONS)
            ->where('user_id', Auth::id())
            ->latest()
            ->get();

        return response()->json(['data' => $this->present($this->includeAuthorFavourites($posts))]);
    }

    public function forLocation($locationId): JsonResponse
    {
        $posts = TravelPost::with(['user:id,name,avatar_url', 'images'])
            ->whereHas('locations', fn ($q) => $q->where('locations.id', $locationId))
            ->latest()
            ->get();

        return response()->json(['data' => $this->includeAuthorFavourites($posts)]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = Auth::user();

        $data = $this->validatePayload($request);

        $post = TravelPost::create([
            'user_id' => $user->id,
            'title' => $data['title'],
            'body' => $data['body'],
        ]);

        if ($request->hasFile('cover_image')) {
            $coverUrl = $this->uploadToSupabase($request->file('cover_image'), 'covers');

            if (! $coverUrl) {
                $post->delete();

                return response()->json(['message' => 'Failed to upload cover image.'], 500);
            }

            $post->update(['cover_image_url' => $coverUrl]);
        }

        $this->syncSnapshot($post, $data, $user->id);
        $this->storeGalleryImages($post, $request);

        return response()->json([
            'message' => 'Travel post published.',
            'data' => $this->present($this->includeAuthorFavourites($post->load(self::RELATIONS))),
        ], 201);
    }

    public function update($id, Request $request): JsonResponse
    {
        $post = TravelPost::findOrFail($id);

        if ($post->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $data = $this->validatePayload($request, [
            'remove_image_ids' => 'array',
            'remove_image_ids.*' => 'integer|exists:post_images,id',
        ]);

        $post->update([
            'title' => $data['title'],
            'body' => $data['body'],
        ]);

        if ($request->hasFile('cover_image')) {
            $coverUrl = $this->uploadToSupabase($request->file('cover_image'), 'covers');

            if (! $coverUrl) {
                return response()->json(['message' => 'Failed to upload cover image.'], 500);
            }

            $post->update(['cover_image_url' => $coverUrl]);
        }

        if (! empty($data['remove_image_ids'])) {
            $post->images()->whereIn('id', $data['remove_image_ids'])->delete();
        }

        $this->syncSnapshot($post, $data, $post->user_id);
        $this->storeGalleryImages($post, $request);

        return response()->json([
            'message' => 'Travel post updated.',
            'data' => $this->present($this->includeAuthorFavourites($post->load(self::RELATIONS))),
        ]);
    }

    public function destroy($id): JsonResponse
    {
        $post = TravelPost::findOrFail($id);

        if ($post->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $locationIds = $post->locations()->pluck('locations.id');
        $post->delete();
        foreach ($locationIds as $locationId) {
            Location::evaluateStatus($locationId);
        }

        return response()->json(['message' => 'Travel post deleted.']);
    }

    /**
     * Reader action: clone this post's trip snapshot into a new itinerary of
     * the current user's. Stops whose gem has since been deleted or marked
     * permanently closed are skipped and named in the response.
     */
    public function copyTrip($id): JsonResponse
    {
        $post = TravelPost::with('stops.location:id,place_name,status,permanently_closed_at')->findOrFail($id);
        $user = Auth::user();

        if ($post->stops->isEmpty()) {
            return response()->json(['message' => 'This travel post has no trip to copy.'], 422);
        }

        $skipped = [];

        $itinerary = DB::transaction(function () use ($post, $user, &$skipped) {
            $trip = TripItinerary::create([
                'user_id' => $user->id,
                'trip_name' => Str::limit($post->title, 60, ''),
            ]);

            $order = 1;

            foreach ($post->stops as $stop) {
                if ($stop->isGemStop()) {
                    $gem = $stop->location;

                    if (! $gem || in_array($gem->status, [Location::STATUS_DELETED, Location::STATUS_ARCHIVED], true)) {
                        $skipped[] = ($gem->place_name ?? $stop->osm_name) ?: 'a removed hidden gem';

                        continue;
                    }

                    if ($gem->permanently_closed_at !== null) {
                        $skipped[] = $gem->place_name.' (permanently closed)';

                        continue;
                    }

                    $trip->locations()->create([
                        'location_id' => $gem->id,
                        'isHidden' => true,
                        'order_number' => $order++,
                    ]);

                    continue;
                }

                $trip->locations()->create([
                    'osm_id' => $stop->osm_id,
                    'osm_name' => $stop->osm_name,
                    'latitude' => $stop->latitude,
                    'longitude' => $stop->longitude,
                    'isHidden' => false,
                    'order_number' => $order++,
                ]);
            }

            return $trip;
        });

        $message = 'Trip copied to your itineraries.';
        if (! empty($skipped)) {
            $message .= ' Skipped '.count($skipped).' stop'.(count($skipped) === 1 ? '' : 's')
                .' no longer available: '.implode(', ', $skipped).'.';
        }

        return response()->json([
            'message' => $message,
            'skipped' => $skipped,
            'data' => $itinerary->load('locations.location'),
        ], 201);
    }

    // ---------------------------------------------------------------------

    private function validatePayload(Request $request, array $extra = []): array
    {
        return $request->validate(array_merge([
            'title' => 'required|string|max:150',
            'body' => 'required|string',
            'itinerary_ids' => 'array',
            'itinerary_ids.*' => 'integer',
            'stops' => 'array',
            'stops.*.location_id' => 'nullable|integer',
            'stops.*.osm_id' => 'nullable|integer',
            'stops.*.osm_name' => 'nullable|string|max:255',
            'stops.*.latitude' => 'nullable|numeric|between:-90,90',
            'stops.*.longitude' => 'nullable|numeric|between:-180,180',
            'stops.*.caption' => 'nullable|string|max:255',
            'stops.*.source_itinerary_id' => 'nullable|integer',
            'cover_image' => 'nullable|image|max:5120',
            'images.*' => 'image|max:5120',
        ], $extra));
    }

    /**
     * Rebuild the post's frozen stop snapshot from the request, then mirror the
     * gem stops into post_locations.
     */
    private function syncSnapshot(TravelPost $post, array $data, int $userId): void
    {
        $ownedItineraryIds = empty($data['itinerary_ids'])
            ? []
            : TripItinerary::whereIn('id', $data['itinerary_ids'])
                ->where('user_id', $userId)
                ->pluck('id')
                ->all();

        $snapshot = $this->buildSnapshot($ownedItineraryIds, $data['stops'] ?? []);

        DB::transaction(function () use ($post, $snapshot, $userId) {
            $post->stops()->delete();

            $order = 0;
            $gemStops = [];

            foreach ($snapshot as $stop) {
                $stop['order_number'] = $order++;
                $post->stops()->create($stop);

                if ($stop['location_id'] !== null) {
                    $gemStops[] = $stop;
                }
            }

            $locationIds = $post->locations()->pluck('locations.id')->all();
            $this->syncPostLocations($post, $gemStops, $userId);
            $locationIds = array_unique(array_merge($locationIds, array_column($gemStops, 'location_id')));
            sort($locationIds);
            foreach ($locationIds as $locationId) {
                Location::evaluateStatus($locationId);
            }
        });
    }

    /**
     * @param  array<int>  $itineraryIds  already filtered to ones the author owns
     * @param  array<int, array<string, mixed>>  $stopInput  the author's edited list, authoritative when present
     * @return array<int, array<string, mixed>> ordered stop attribute rows
     */
    private function buildSnapshot(array $itineraryIds, array $stopInput): array
    {
        $rawStops = ! empty($stopInput)
            ? collect($stopInput)
            : $this->stopsFromItineraries($itineraryIds);

        // Resolve every gem id referenced, in one query.
        $gemIds = $rawStops
            ->map(fn ($s) => $s['location_id'] ?? null)
            ->filter()
            ->unique()
            ->values();

        $gems = $gemIds->isEmpty()
            ? collect()
            : Location::whereIn('id', $gemIds)
                ->whereIn('status', self::TAGGABLE_STATUSES)
                ->whereNull('permanently_closed_at')
                ->get()
                ->keyBy('id');

        $seen = [];
        $out = [];

        foreach ($rawStops as $stop) {
            $locationId = $stop['location_id'] ?? null;

            if ($locationId) {
                $gem = $gems->get($locationId);
                if (! $gem) {
                    continue; // not taggable (pending/rejected/closed/deleted) — drop it
                }

                $key = 'g:'.$gem->id;
                if (isset($seen[$key])) {
                    continue;
                }
                $seen[$key] = true;

                $out[] = [
                    'location_id' => $gem->id,
                    'osm_id' => null,
                    'osm_name' => $gem->place_name,
                    'latitude' => $gem->latitude,
                    'longitude' => $gem->longitude,
                    'caption' => $this->trimCaption($stop['caption'] ?? null),
                    'source_itinerary_id' => $stop['source_itinerary_id'] ?? null,
                ];

                continue;
            }

            // OSM stop — needs a name and a coordinate to be worth keeping.
            $osmName = trim((string) ($stop['osm_name'] ?? ''));
            $lat = $stop['latitude'] ?? null;
            $lng = $stop['longitude'] ?? null;

            if ($osmName === '' || $lat === null || $lng === null) {
                continue;
            }

            $osmId = $stop['osm_id'] ?? null;
            $key = $osmId ? 'o:'.$osmId : 'c:'.round((float) $lat, 5).','.round((float) $lng, 5);
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;

            $out[] = [
                'location_id' => null,
                'osm_id' => $osmId,
                'osm_name' => $osmName,
                'latitude' => (float) $lat,
                'longitude' => (float) $lng,
                'caption' => $this->trimCaption($stop['caption'] ?? null),
                'source_itinerary_id' => $stop['source_itinerary_id'] ?? null,
            ];
        }

        return $out;
    }

    /** Merge several itineraries' stops into one ordered list (itinerary order, then stop order). */
    private function stopsFromItineraries(array $itineraryIds): Collection
    {
        if (empty($itineraryIds)) {
            return collect();
        }

        return TripItinerary::whereIn('id', $itineraryIds)
            ->with(['locations' => fn ($q) => $q->orderBy('order_number')])
            ->get()
            ->sortBy(fn ($trip) => array_search($trip->id, $itineraryIds, true))
            ->flatMap(function (TripItinerary $trip) {
                return $trip->locations->map(fn (TripLocation $stop) => [
                    'location_id' => $stop->isHidden ? $stop->location_id : null,
                    'osm_id' => $stop->isHidden ? null : $stop->osm_id,
                    'osm_name' => $stop->osm_name,
                    'latitude' => $stop->latitude,
                    'longitude' => $stop->longitude,
                    'caption' => null,
                    'source_itinerary_id' => $trip->id,
                ]);
            })
            ->values();
    }

    private function syncPostLocations(TravelPost $post, array $gemStops, int $userId): void
    {
        $post->locations()->detach();

        if (empty($gemStops)) {
            return;
        }

        $ids = array_map(fn ($s) => $s['location_id'], $gemStops);
        $visited = CheckIn::where('user_id', $userId)
            ->whereIn('location_id', $ids)
            ->pluck('location_id')
            ->all();

        foreach ($gemStops as $stop) {
            $post->locations()->attach($stop['location_id'], [
                'caption' => $stop['caption'],
                'order_number' => $stop['order_number'],
                'visited' => in_array($stop['location_id'], $visited, true),
            ]);
        }
    }

    private function trimCaption(?string $caption): ?string
    {
        $caption = trim((string) $caption);

        return $caption === '' ? null : Str::limit($caption, 255, '');
    }

    private function includeAuthorFavourites(TravelPost|Collection $posts): TravelPost|Collection
    {
        $postCollection = $posts instanceof TravelPost ? collect([$posts]) : $posts;
        $users = $postCollection->pluck('user')->filter()->unique('id')->values();
        $favouritesByUser = $this->specialAchievements->activeFavouritesForUsers($users->pluck('id'));

        $users->each(function ($user) use ($favouritesByUser) {
            $user->setAttribute(
                'favourite_achievements',
                $favouritesByUser->get($user->id, [])
            );
        });

        return $posts;
    }

    private function publicRelations(): array
    {
        return [
            'user:id,name,avatar_url',
            'images',
            'stops.location:id,place_name,state,category_id,description,latitude,longitude,status,report_status,permanently_closed_at',
            'stops.location.category:id,name',
            'stops.location.images:id,location_id,image_url',
            'stops.sourceItinerary:id,trip_name',
            // The post_locations mirror — kept for the gem-detail "Community
            // Stories" list and older clients that read `locations`.
            'locations' => fn ($query) => $query->select(self::PUBLIC_LOCATION_COLUMNS),
            'locations.category:id,name',
            'locations.images:id,location_id,image_url',
        ];
    }

    /**
     * Flatten each post's stop snapshot into a display-ready `stops` array and
     * keep `locations` populated for older clients.
     */
    private function present(TravelPost|Collection $posts): TravelPost|Collection
    {
        $collection = $posts instanceof TravelPost ? collect([$posts]) : $posts;

        $collection->each(function (TravelPost $post) {
            if (! $post->relationLoaded('stops')) {
                return;
            }

            $stops = $post->stops->map(function (PostStop $stop) {
                $isGem = $stop->isGemStop();
                // A gem stop is "removed" if the row is gone or its status is
                // now deleted/archived through logical removal.
                $live = ($isGem && $stop->location && ! in_array($stop->location->status, [Location::STATUS_DELETED, Location::STATUS_ARCHIVED], true))
                    ? $stop->location
                    : null;
                $lat = $live?->latitude ?? $stop->latitude;
                $lng = $live?->longitude ?? $stop->longitude;

                return [
                    'id' => $stop->id,
                    'order_number' => $stop->order_number,
                    'kind' => $isGem ? 'gem' : 'osm',
                    'name' => $live?->place_name ?? $stop->osm_name ?? 'Stop',
                    'caption' => $stop->caption,
                    'latitude' => $lat !== null ? (float) $lat : null,
                    'longitude' => $lng !== null ? (float) $lng : null,
                    'source_trip' => $stop->sourceItinerary?->trip_name,
                    'removed' => $isGem && ! $live,
                    'gem' => $live ? [
                        'id' => $live->id,
                        'place_name' => $live->place_name,
                        'state' => $live->state,
                        'category' => $live->category?->name,
                        'status' => $live->status,
                        'permanently_closed_at' => $live->permanently_closed_at,
                        'image_url' => $live->images->first()?->image_url,
                    ] : null,
                ];
            })->values();

            $post->unsetRelation('stops');
            $post->setAttribute('stops', $stops);
        });

        return $posts;
    }

    private function storeGalleryImages(TravelPost $post, Request $request): void
    {
        if (! $request->hasFile('images')) {
            return;
        }

        $nextOrder = (int) $post->images()->max('order_number') + 1;

        foreach ($request->file('images') as $image) {
            $url = $this->uploadToSupabase($image, 'gallery');

            if (! $url) {
                continue;
            }

            PostImage::create([
                'travel_post_id' => $post->id,
                'image_url' => $url,
                'order_number' => $nextOrder++,
            ]);
        }
    }

    private function uploadToSupabase($image, string $folder): ?string
    {
        $fileName = "travel-posts/{$folder}/".uniqid().'.'.$image->getClientOriginalExtension();

        try {
            return $this->storage->uploadPublic(
                config('services.supabase.post_images_bucket', 'post_images'),
                $fileName,
                file_get_contents($image->getRealPath()),
                $image->getMimeType(),
            );
        } catch (ObjectStorageException) {
            return null;
        }
    }
}
