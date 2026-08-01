<?php

namespace App\Http\Controllers;

use App\Models\Location;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class HiddenGemController extends Controller
{
    private const SEARCH_RESULT_LIMIT = 20;

    private const OSM_CACHE_TTL_HOURS = 6;

    /**
     * Return the Hidden Gems available for itinerary stopping-point selection.
     */
    public function index(): JsonResponse
    {
        $hiddenGems = Location::query()
            ->hiddenGems()
            ->select(['id', 'place_name', 'latitude', 'longitude'])
            ->orderBy('place_name')
            ->get()
            ->map(fn (Location $location) => [
                'id' => $location->id,
                'name' => $location->place_name,
                'latitude' => $location->latitude,
                'longitude' => $location->longitude,
            ]);

        return response()->json(['data' => $hiddenGems]);
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
            ->hiddenGems()
            ->where('place_name', 'ILIKE', '%'.$query.'%')
            ->select(['id', 'place_name', 'latitude', 'longitude'])
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
                ->withUserAgent(config('app.name', 'Gemora').' location search')
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
            'latitude' => $location->latitude,
            'longitude' => $location->longitude,
            'source' => 'database',
        ];
    }
}
