<?php

namespace App\Services;

use App\Models\OsmAttraction;
use App\Models\OsmSyncCell;
use App\Support\Geo;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;

class OsmAttractionCache
{
    private const NEARBY_RESULT_LIMIT = 60;
    private const OVERPASS_TIMEOUT_SECONDS = 5;

    /** Place types worth showing on the map, grouped by their OSM tag. */
    private const NEARBY_TAG_FILTERS = [
        'tourism' => 'attraction|museum|viewpoint|gallery|zoo|theme_park|artwork|aquarium|picnic_site',
        'leisure' => 'park|garden|nature_reserve|water_park|beach_resort',
        'historic' => 'monument|memorial|ruins|castle|archaeological_site|temple',
        'amenity' => 'restaurant|cafe|fast_food|bar|pub|cinema|theatre|marketplace|food_court|ice_cream',
        'shop' => 'mall|department_store',
        'natural' => 'beach|peak|cave_entrance',
    ];

    /** ~5.5km per cell at Malaysia's latitude — bigger than the 3km max query
     *  radius, so one synced cell almost always covers a whole query. */
    private const GRID_DEGREES = 0.05;

    /** Covers a whole grid cell plus margin from its center in one Overpass hit. */
    private const SYNC_RADIUS_METERS = 4000;

    /** OSM place data changes slowly — a month-old cache entry is still good. */
    private const CELL_TTL_DAYS = 30;

    // The whole app only ever operates within Malaysia (map bounds, Nominatim
    // countrycodes=my, ...), so the cache never needs to cover anywhere else.
    private const MALAYSIA_BOUNDS = [0.5, 7.5, 99.5, 119.5]; // [minLat, maxLat, minLng, maxLng]

    /**
     * Nearby attractions around a point — served from the database whenever
     * possible, only falling back to a live Overpass call when the covering
     * grid cell has never been synced or has gone stale. Lets Overpass/network
     * failures propagate as exceptions rather than swallowing them, so callers
     * decide whether a failure should look like "nothing found" or be surfaced
     * distinctly.
     */
    public function nearby(float $lat, float $lng, int $radius): Collection
    {
        if (!$this->withinMalaysia($lat, $lng)) {
            // Outside the app's whole coverage area — not worth caching, just
            // ask Overpass directly for this one request.
            return $this->fetchLive($lat, $lng, $radius);
        }

        $this->ensureCellSynced($lat, $lng);

        return $this->queryDatabase($lat, $lng, $radius);
    }

    public function withinMalaysia(float $lat, float $lng): bool
    {
        [$minLat, $maxLat, $minLng, $maxLng] = self::MALAYSIA_BOUNDS;

        return $lat >= $minLat && $lat <= $maxLat && $lng >= $minLng && $lng <= $maxLng;
    }

    public function gridCellKey(float $lat, float $lng): string
    {
        $gridLat = round($lat / self::GRID_DEGREES) * self::GRID_DEGREES;
        $gridLng = round($lng / self::GRID_DEGREES) * self::GRID_DEGREES;

        return round($gridLat, 4).':'.round($gridLng, 4);
    }

    public function isCellFresh(string $cellKey): bool
    {
        $cell = OsmSyncCell::where('cell_key', $cellKey)->first();

        return $cell && $cell->synced_at->gt(now()->subDays(self::CELL_TTL_DAYS));
    }

    /**
     * Refreshes the grid cell covering ($lat, $lng) from Overpass if it's
     * missing or older than the TTL. Only marks the cell synced on success 
     */
    public function ensureCellSynced(float $lat, float $lng): void
    {
        $cellKey = $this->gridCellKey($lat, $lng);

        if ($this->isCellFresh($cellKey)) {
            return;
        }

        [$gridLatPart, $gridLngPart] = explode(':', $cellKey);
        $gridLat = (float) $gridLatPart;
        $gridLng = (float) $gridLngPart;

        $places = $this->fetchLive($gridLat, $gridLng, self::SYNC_RADIUS_METERS);

        foreach ($places as $place) {
            OsmAttraction::updateOrCreate(
                ['osm_type' => $place['osm_type'], 'osm_id' => $place['osm_id']],
                [
                    'name' => $place['name'],
                    'type' => $place['type'],
                    'latitude' => $place['latitude'],
                    'longitude' => $place['longitude'],
                    'address' => $place['address'],
                    'opening_hours' => $place['openingHours'],
                    'phone' => $place['phone'],
                    'website' => $place['website'],
                ]
            );
        }

        OsmSyncCell::updateOrCreate(['cell_key' => $cellKey], ['synced_at' => now()]);
    }

    private function queryDatabase(float $lat, float $lng, int $radius): Collection
    {
        [$minLat, $maxLat, $minLng, $maxLng] = Geo::boundingBox($lat, $lng, $radius);

        return OsmAttraction::query()
            ->whereBetween('latitude', [$minLat, $maxLat])
            ->whereBetween('longitude', [$minLng, $maxLng])
            ->get()
            ->map(function (OsmAttraction $row) use ($lat, $lng) {
                return [
                    'id' => 'osm-'.$row->osm_type.'-'.$row->osm_id,
                    'osm_id' => $row->osm_id,
                    'name' => $row->name,
                    'type' => $row->type,
                    'latitude' => (float) $row->latitude,
                    'longitude' => (float) $row->longitude,
                    'source' => 'openstreetmap',
                    'address' => $row->address,
                    'openingHours' => $row->opening_hours,
                    'phone' => $row->phone,
                    'website' => $row->website,
                    'distance' => (int) round(Geo::distanceMeters($lat, $lng, $row->latitude, $row->longitude)),
                ];
            })
            ->filter(fn (array $place) => $place['distance'] <= $radius)
            ->sortBy('distance')
            ->take(self::NEARBY_RESULT_LIMIT)
            ->values();
    }

    /**
     * The actual Overpass HTTP call — used directly for out-of-Malaysia points,
     * and by ensureCellSynced() to (re)populate the local cache.
     */
    private function fetchLive(float $lat, float $lng, int $radius): Collection
    {
        $clauses = '';
        foreach (self::NEARBY_TAG_FILTERS as $tag => $pattern) {
            $clauses .= "node[\"{$tag}\"~\"^({$pattern})$\"](around:{$radius},{$lat},{$lng});";
        }

        $overpassQuery = '[out:json][timeout:'.self::OVERPASS_TIMEOUT_SECONDS.'];'
            . "({$clauses});"
            . 'out body '.self::NEARBY_RESULT_LIMIT.';';

        // Overpass answers 406 Not Acceptable to Guzzle's default User-Agent,
        // so an explicit one is required here (same as the Nominatim calls).
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
                    'osm_type' => $element['type'],
                    'osm_id' => $element['id'],
                    'name' => $name,
                    'type' => $type,
                    'latitude' => (float) $placeLat,
                    'longitude' => (float) $placeLng,
                    'source' => 'openstreetmap',
                    'address' => $this->formatOsmAddress($tags),
                    'openingHours' => $tags['opening_hours'] ?? null,
                    'phone' => $tags['phone'] ?? $tags['contact:phone'] ?? null,
                    'website' => $tags['website'] ?? $tags['contact:website'] ?? null,
                ];
            })
            ->filter()
            ->unique('id')
            ->values();

        return $places
            ->map(function (array $place) use ($lat, $lng) {
                $place['distance'] = (int) round(Geo::distanceMeters($lat, $lng, $place['latitude'], $place['longitude']));

                return $place;
            })
            ->sortBy('distance')
            ->values();
    }

    private function formatOsmAddress(array $tags): ?string
    {
        $street = trim(($tags['addr:housenumber'] ?? '').' '.($tags['addr:street'] ?? ''));
        $parts = array_filter([
            $street !== '' ? $street : null,
            $tags['addr:city'] ?? null,
            $tags['addr:postcode'] ?? null,
        ]);

        return $parts ? implode(', ', $parts) : null;
    }
}
