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
            'images.*' => 'image|max:2048'
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
        ]);

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
            'data' => $location
        ], 201);
    }


    /**
     * Return the Hidden Gems list for React frontend.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Location::with(['user', 'category', 'images']);

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
     * Search approved Hidden Gems first, then supplement the results with OSM.
     */
    public function search(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'query' => ['required', 'string', 'min:2', 'max:100'],
        ]);

        $query = trim($validated['query']);

        if ($query === '') {
            return response()->json([
                'database' => [],
                'openStreetMap' => [],
            ]);
        }

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
            $openStreetMapLocations = $this->searchOpenStreetMap($query, $remainingResults);
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
        $states = Location::distinct()
                          ->pluck('state')
                          ->filter()
                          ->values();

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

    // ==================== PRIVATE METHODS ====================

    private function searchOpenStreetMap(string $query, int $remainingResults): Collection
    {
        $cacheKey = 'osm-search:'.md5($query.':'.$remainingResults);

        $cached = Cache::get($cacheKey);
        if ($cached !== null) {
            return $cached;
        }

        try {
            $results = $this->fetchFromNominatim($query, $remainingResults);
            Cache::put($cacheKey, $results, now()->addHours(self::OSM_CACHE_TTL_HOURS));

            return $results;
        } catch (\Throwable $exception) {
            report($exception);

            return collect(); // not cached — next request will retry Nominatim
        }
    }

    private function fetchFromNominatim(string $query, int $remainingResults): Collection
    {
        return collect(
            Http::acceptJson()
                ->withUserAgent(config('app.name', 'HiddenMY').' location search')
                ->timeout(5)
                ->get('https://nominatim.openstreetmap.org/search', [
                    'q' => $query,
                    'format' => 'jsonv2',
                    'limit' => $remainingResults,
                    'countrycodes' => 'my', // Restrict search to Malaysia
                ])
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
}
