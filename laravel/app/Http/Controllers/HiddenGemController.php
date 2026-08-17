<?php

namespace App\Http\Controllers;

use App\Models\Location;
use App\Models\Category;
use App\Models\LocationImage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;

class HiddenGemController extends Controller
{
    private const SEARCH_RESULT_LIMIT = 20;

    private const OSM_CACHE_TTL_HOURS = 6;

    private const NEARBY_RADIUS_METERS = 1500;

    private const NEARBY_RESULT_LIMIT = 60;

    private const VIEWPORT_RESULT_LIMIT = 300;

    /**
     * Overpass is a free, shared, per-IP rate-limited service whose latency swings
     * between ~0.8s and >12s (and answers 429 when busy). To keep the map inside its
     * performance budget we (a) fail fast rather than hanging, (b) snap cache keys to
     * a coarse grid so panning reuses one entry, (c) cache successes for a long time,
     * and (d) cache failures briefly so a bad patch isn't retried on every pan.
     */
    private const OVERPASS_TIMEOUT_SECONDS = 5;

    private const NEARBY_CACHE_TTL_DAYS = 7;

    private const NEARBY_FAILURE_TTL_MINUTES = 5;

    /** ~1.1km grid — coarse enough that small pans share a cache entry. */
    private const NEARBY_GRID_PRECISION = 2;

    /** Place types worth showing on the map, grouped by their OSM tag. */
    private const NEARBY_TAG_FILTERS = [
        'tourism' => 'attraction|museum|viewpoint|gallery|zoo|theme_park|artwork|aquarium|picnic_site',
        'leisure' => 'park|garden|nature_reserve|water_park|beach_resort',
        'historic' => 'monument|memorial|ruins|castle|archaeological_site|temple',
        'amenity' => 'restaurant|cafe|fast_food|bar|pub|cinema|theatre|marketplace|food_court|ice_cream',
        'shop' => 'mall|department_store',
        'natural' => 'beach|peak|cave_entrance',
    ];

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
            'postcode' => 'required|integer',
            'description' => 'required|string',
            'latitude' => 'required|numeric',
            'longitude' => 'required|numeric',
            'images.*' => 'image|max:5120'
        ]);

        $existingLocation = Location::where('place_name', $request->place_name)
            ->where('address', $request->address)
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
        $query = Location::with(['user', 'category', 'images'])
            ->where('status', '!=', 'deleted');

        // Filter by status (verified / pending)
        if ($request->has('status') && in_array($request->status, ['verified', 'pending'])) {
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

        // Search by place name
        if ($request->has('search') && $request->search) {
            $query->where('place_name', 'like', '%' . $request->search . '%');
        }

        $hiddenGems = $query->latest()->paginate(12);

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
        ->where('user_id', $user->id)
        ->where('status', '!=', 'deleted')
        ->latest()
        ->get();

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

        if ($gem->status !== 'pending') {
            return response()->json([
                'message' => 'Only pending hidden gems can be edited.'
            ], 403);
        }

        $validated = $request->validate([
            'category_id' => 'required|exists:categories,id',
            'place_name' => 'required|string|max:255',
            'address' => 'required|string|max:255',
            'state' => 'required|string|max:100',
            'postcode' => 'required',
            'description' => 'required|string',
            'latitude' => 'required|numeric',
            'longitude' => 'required|numeric',
        ]);

        // Update hidden gem information
        $gem->update($validated);

        // Reset verification progress after editing
        $gem->vote_count = 0;
        $gem->status = 'pending';
        $gem->save();

        // Remove previous vote records
        $gem->votes()->delete();

        return response()->json([
            'message' => 'Hidden gem updated successfully. Verification progress has been reset.',
            'data' => $gem->load(['category', 'images'])
        ]);
    }

    /**
     * Display a single Hidden Gem detail.
     */
    public function show($id): JsonResponse
    {
        $location = Location::with(['user', 'category', 'images', 'votes.user'])
                            ->findOrFail($id);

        return response()->json(['data' => $location]);
    }

    /**
     * Nearby attractions (from OpenStreetMap) around a Hidden Gem — powers the
     * "Near this gem" section shown under a gem's detail in the map panel.
     */
    public function nearby(Request $request, $id): JsonResponse
    {
        $gem = Location::findOrFail($id);

        $radius = (int) $request->query('radius', self::NEARBY_RADIUS_METERS);
        $radius = max(100, min(3000, $radius));

        $results = $this->fetchNearbyFromOverpass((float) $gem->latitude, (float) $gem->longitude, $radius);

        return response()->json(['data' => $results]);
    }

    /**
     * Nearby attractions around an arbitrary coordinate — used by the map's
     * zoom-in "explore nearby" discovery, which has no Hidden Gem to key off.
     */
    public function nearbyAttractions(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'radius' => ['nullable', 'integer', 'between:100,3000'],
        ]);

        $results = $this->fetchNearbyFromOverpass(
            (float) $validated['latitude'],
            (float) $validated['longitude'],
            (int) ($validated['radius'] ?? self::NEARBY_RADIUS_METERS)
        );

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
            'status' => ['nullable', 'in:verified,pending'],
        ]);

        $query = Location::with(['category', 'images'])
            ->where('status', '!=', 'deleted')
            ->whereBetween('latitude', [$validated['south'], $validated['north']])
            ->whereBetween('longitude', [$validated['west'], $validated['east']]);

        if (!empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        return response()->json([
            'data' => $query->limit(self::VIEWPORT_RESULT_LIMIT)->get(),
        ]);
    }

    /**
     * Search approved Hidden Gems first, then supplement the results with OSM.
     */
    public function search(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'query' => ['required', 'string', 'min:2', 'max:100'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
        ]);

        $query = trim($validated['query']);
        $latitude = isset($validated['latitude']) ? (float) $validated['latitude'] : null;
        $longitude = isset($validated['longitude']) ? (float) $validated['longitude'] : null;

        if ($query === '') {
            return response()->json([
                'database' => [],
                'openStreetMap' => [],
            ]);
        }

        // Hidden Gems are always searched and displayed first, regardless of location.
        $databaseLocations = Location::query()
            ->where(function ($q) use ($query) {
                $q->where('place_name', 'ILIKE', '%'.$query.'%')
                ->orWhere('state', 'ILIKE', '%'.$query.'%');
            })
            ->select(['id', 'place_name', 'state', 'latitude', 'longitude'])
            ->orderBy('place_name')
            ->limit(self::SEARCH_RESULT_LIMIT)
            ->get()
            ->map(fn (Location $location) => $this->locationSearchResult($location));

        $remainingResults = self::SEARCH_RESULT_LIMIT - $databaseLocations->count();
        $openStreetMapLocations = collect();

        if ($remainingResults > 0) {
            // Only OSM results are affected by the optional user location: when present,
            // they're fetched with a nearby bias and sorted by distance.
            $openStreetMapLocations = $this->searchOpenStreetMap($query, $remainingResults, $latitude, $longitude);
        }

        return response()->json([
            'database' => $databaseLocations,
            'openStreetMap' => $openStreetMapLocations,
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

        $match = $this->searchOpenStreetMap(trim($validated['query']), 1)->first();

        if (! $match) {
            return response()->json(['message' => 'No matching location found.'], 404);
        }

        return response()->json([
            'latitude' => $match['latitude'],
            'longitude' => $match['longitude'],
            'name' => $match['name'],
        ]);
    }

    /**
     * Identify the location under a coordinate the user clicked on the map
     * (reverse geocoding via Nominatim). The clicked coordinate itself is
     * always used as the stopping point's position — Nominatim is only
     * used to look up a human-readable name and an osm_id for it.
     */
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

        $postcode = $addressDetails['postcode'] ?? '';

        return response()->json([
            'address' => $result['display_name'],
            'state' => $state,
            'postcode' => $postcode,
            'latitude' => $latitude,
            'longitude' => $longitude,
        ]);
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
        $recentLocations = Location::with(['user', 'category', 'images'])
            ->latest()
            ->take(6)
            ->get();

        return response()->json($recentLocations);
    }

    /**
     * Top-voted, verified Hidden Gems (used by the "Popular" row on the map page).
     */
    public function popular(): JsonResponse
    {
        $popularLocations = Location::with(['user', 'category', 'images'])
            ->where('status', 'verified')
            ->orderByDesc('vote_count')
            ->take(6)
            ->get();

        return response()->json($popularLocations);
    }

    // ==================== PRIVATE METHODS ====================

    private function searchOpenStreetMap(string $query, int $remainingResults, ?float $latitude = null, ?float $longitude = null): Collection
    {
        $cacheKey = 'osm-search:'.md5($query.':'.$remainingResults.':'.($latitude ?? 'x').':'.($longitude ?? 'x'));

        $cached = Cache::get($cacheKey);
        if ($cached !== null) {
            return $cached;
        }

        try {
            $results = $this->fetchFromNominatim($query, $remainingResults, $latitude, $longitude);
            Cache::put($cacheKey, $results, now()->addHours(self::OSM_CACHE_TTL_HOURS));

            return $results;
        } catch (\Throwable $exception) {
            report($exception);

            return collect(); // not cached — next request will retry Nominatim
        }
    }

    private function fetchFromNominatim(string $query, int $remainingResults, ?float $latitude = null, ?float $longitude = null): Collection
    {
        $hasLocation = $latitude !== null && $longitude !== null;

        $params = [
            'q' => $query,
            'format' => 'jsonv2',
            // Fetch extra candidates when biasing by location so sorting by distance has more to work with.
            'limit' => $hasLocation ? max($remainingResults, self::SEARCH_RESULT_LIMIT) : $remainingResults,
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

        return $results->take($remainingResults)->values();
    }

    private function distanceInKm(float $lat1, float $lon1, float $lat2, float $lon2): float
    {
        $earthRadiusKm = 6371;

        $latDelta = deg2rad($lat2 - $lat1);
        $lonDelta = deg2rad($lon2 - $lon1);

        $a = sin($latDelta / 2) ** 2
            + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($lonDelta / 2) ** 2;

        return $earthRadiusKm * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }

    private function locationSearchResult(Location $location): array
    {
        return [
            'id' => $location->id,
            'name' => $location->place_name,
            'state' => $location->state,
            'latitude' => $location->latitude,
            'longitude' => $location->longitude,
            'source' => 'database',
        ];
    }

    /**
     * Named OSM points (attractions, museums, restaurants, cafes, ...) within
     * NEARBY_RADIUS_METERS of a coordinate, via the free Overpass API — no
     * ratings/reviews available from OSM, just name/type/distance.
     */
    private function fetchNearbyFromOverpass(float $lat, float $lng, ?int $radius = null): Collection
    {
        $radius = $radius ?? self::NEARBY_RADIUS_METERS;

        // Snap the cache key to a coarse grid. Keying on the exact coordinate meant
        // moving a few metres missed the cache and paid the full Overpass round-trip.
        $cacheKey = sprintf(
            'osm-nearby:%s:%s:%d',
            number_format(round($lat, self::NEARBY_GRID_PRECISION), self::NEARBY_GRID_PRECISION, '.', ''),
            number_format(round($lng, self::NEARBY_GRID_PRECISION), self::NEARBY_GRID_PRECISION, '.', ''),
            $radius
        );

        $places = Cache::get($cacheKey);

        if ($places === null) {
            $places = $this->requestNearbyFromOverpass($lat, $lng, $radius);
        }

        // Distances are measured from the caller's exact position, not the grid
        // centre the results were cached under.
        return $places
            ->map(function (array $place) use ($lat, $lng) {
                $place['distance'] = (int) round(
                    $this->haversineMeters($lat, $lng, $place['latitude'], $place['longitude'])
                );

                return $place;
            })
            ->sortBy('distance')
            ->values();
    }

    /**
     * One Overpass round-trip, writing whatever it learns (including failure) to cache.
     */
    private function requestNearbyFromOverpass(float $lat, float $lng, int $radius): Collection
    {
        $cacheKey = sprintf(
            'osm-nearby:%s:%s:%d',
            number_format(round($lat, self::NEARBY_GRID_PRECISION), self::NEARBY_GRID_PRECISION, '.', ''),
            number_format(round($lng, self::NEARBY_GRID_PRECISION), self::NEARBY_GRID_PRECISION, '.', ''),
            $radius
        );

        // `nwr` (node/way/relation) rather than `node` alone: parks, malls, museums and
        // most large attractions are mapped as ways or relations, so a node-only query
        // silently missed them. `out center` gives those a usable centre point.
        $clauses = '';
        foreach (self::NEARBY_TAG_FILTERS as $tag => $pattern) {
            $clauses .= "nwr[\"{$tag}\"~\"^({$pattern})$\"](around:{$radius},{$lat},{$lng});";
        }

        $overpassQuery = '[out:json][timeout:'.self::OVERPASS_TIMEOUT_SECONDS.'];'
            . "({$clauses});"
            . 'out center '.self::NEARBY_RESULT_LIMIT.';';

        try {
            // Overpass answers 406 Not Acceptable to Guzzle's default User-Agent,
            // so an explicit one is required here (same as the Nominatim call above).
            $response = Http::asForm()
                ->withUserAgent(config('app.name', 'HiddenMY').' nearby attractions')
                ->timeout(self::OVERPASS_TIMEOUT_SECONDS)
                ->post('https://overpass-api.de/api/interpreter', ['data' => $overpassQuery])
                ->throw()
                ->json();

            $places = collect($response['elements'] ?? [])
                ->map(function (array $element) {
                    $tags = $element['tags'] ?? [];
                    $name = $tags['name'] ?? null;

                    // Nodes carry lat/lon directly; ways and relations get a centre.
                    $placeLat = $element['lat'] ?? $element['center']['lat'] ?? null;
                    $placeLng = $element['lon'] ?? $element['center']['lon'] ?? null;

                    if (!$name || $placeLat === null || $placeLng === null) {
                        return null;
                    }

                    $type = 'place';
                    foreach (array_keys(self::NEARBY_TAG_FILTERS) as $tag) {
                        if (!empty($tags[$tag])) {
                            $type = $tags[$tag];
                            break;
                        }
                    }

                    return [
                        'id' => 'osm-'.$element['type'].'-'.$element['id'],
                        'osm_id' => $element['id'],
                        'name' => $name,
                        'type' => $type,
                        'latitude' => (float) $placeLat,
                        'longitude' => (float) $placeLng,
                        'source' => 'openstreetmap',
                    ];
                })
                ->filter()
                ->unique('id')
                ->values();

            Cache::put($cacheKey, $places, now()->addDays(self::NEARBY_CACHE_TTL_DAYS));

            return $places;
        } catch (\Throwable $exception) {
            report($exception);

            // Cache the miss briefly. Overpass rate-limits per IP (429) and a bad call
            // costs the full timeout, so retrying it on every pan makes things worse.
            Cache::put($cacheKey, collect(), now()->addMinutes(self::NEARBY_FAILURE_TTL_MINUTES));

            return collect();
        }
    }

    private function haversineMeters(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $earthRadiusMeters = 6371000;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);

        $a = sin($dLat / 2) ** 2
            + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        return $earthRadiusMeters * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }
}
