<?php

namespace App\Services\HiddenGems;

use App\Models\Location;
use App\Support\Geo;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

class HiddenGemSearch
{
    private const RESULT_LIMIT = 20;

    private const OSM_FETCH_LIMIT = 50;

    private const OSM_CACHE_TTL_HOURS = 6;

    private const NEARBY_VIEWBOX_DEGREES = 0.5;

    public function search(
        string $query,
        ?float $latitude = null,
        ?float $longitude = null,
        int $databaseOffset = 0,
        int $osmOffset = 0,
    ): array {
        $query = trim($query);
        if ($query === '') {
            return [
                'database' => [],
                'openStreetMap' => [],
                'nextDbOffset' => 0,
                'nextOsmOffset' => 0,
                'hasMore' => false,
            ];
        }

        $databaseQuery = Location::query()
            ->publiclyVisible()
            ->where(function ($builder) use ($query) {
                $builder->where('place_name', 'ILIKE', '%'.$query.'%')
                    ->orWhere('state', 'ILIKE', '%'.$query.'%');
            });
        $totalDatabaseMatches = (clone $databaseQuery)->count();
        $databaseLocations = $databaseQuery
            ->select(['id', 'place_name', 'state', 'latitude', 'longitude', 'status', 'permanently_closed_at'])
            ->orderBy('place_name')
            ->skip($databaseOffset)
            ->limit(self::RESULT_LIMIT)
            ->get()
            ->map(fn (Location $location) => $this->locationResult($location));

        $nextDatabaseOffset = $databaseOffset + $databaseLocations->count();
        $hasMoreDatabase = $nextDatabaseOffset < $totalDatabaseMatches;
        $remainingResults = self::RESULT_LIMIT - $databaseLocations->count();
        $osmLocations = collect();
        $nextOsmOffset = $osmOffset;
        $hasMoreOsm = false;

        if ($remainingResults > 0) {
            $allOsmMatches = $this->searchOpenStreetMap($query, $latitude, $longitude);
            $osmLocations = $allOsmMatches->slice($osmOffset, $remainingResults)->values();
            $nextOsmOffset = $osmOffset + $osmLocations->count();
            $hasMoreOsm = $nextOsmOffset < $allOsmMatches->count();
        }

        return [
            'database' => $databaseLocations,
            'openStreetMap' => $osmLocations,
            'nextDbOffset' => $nextDatabaseOffset,
            'nextOsmOffset' => $nextOsmOffset,
            'hasMore' => $hasMoreDatabase || $hasMoreOsm,
        ];
    }

    public function locationResult(Location $location): array
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

    private function searchOpenStreetMap(
        string $query,
        ?float $latitude,
        ?float $longitude,
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
        } catch (Throwable $exception) {
            report($exception);

            return collect();
        }
    }

    private function fetchFromNominatim(
        string $query,
        ?float $latitude,
        ?float $longitude,
    ): Collection {
        $hasLocation = $latitude !== null && $longitude !== null;
        $params = [
            'q' => $query,
            'format' => 'jsonv2',
            'limit' => self::OSM_FETCH_LIMIT,
            'countrycodes' => 'my',
        ];

        if ($hasLocation) {
            $radius = self::NEARBY_VIEWBOX_DEGREES;
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
            return $results
                ->sortBy(fn (array $location) => Geo::distanceMeters(
                    $latitude,
                    $longitude,
                    $location['latitude'],
                    $location['longitude'],
                ))
                ->values();
        }

        return $results;
    }
}
