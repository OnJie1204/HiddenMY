<?php

namespace App\Services\Geocoding;

use App\Integrations\Geocoding\NominatimClient;
use App\Integrations\Geocoding\PhotonClient;
use Illuminate\Support\Facades\Cache;
use Throwable;

class MalaysiaGeocoder
{
    private const ADDRESS_SUGGESTION_LIMIT = 6;

    private const CACHE_TTL_HOURS = 6;

    private const MALAYSIA_STATES = [
        'Johor', 'Kuala Lumpur', 'Penang', 'Selangor', 'Melaka', 'Perak', 'Pahang',
        'Sarawak', 'Sabah', 'Terengganu', 'Kelantan', 'Kedah', 'Negeri Sembilan',
        'Perlis', 'Putrajaya', 'Labuan',
    ];

    public function __construct(
        private NominatimClient $nominatim,
        private PhotonClient $photon,
    ) {}

    public function geocode(string $query): array
    {
        try {
            $results = $this->nominatim->search([
                'q' => trim($query),
                'format' => 'jsonv2',
                'limit' => 1,
                'countrycodes' => 'my',
                'addressdetails' => 1,
            ], 'hidden gem address geocoder');
        } catch (Throwable $exception) {
            report($exception);

            throw new GeocodingException('Unable to identify this location. Please try again.', 502);
        }

        $match = $results[0] ?? null;
        if (! $match) {
            throw new GeocodingException('No matching location found.', 404);
        }

        $address = $match['address'] ?? [];
        $specificFields = [
            'house_number', 'road', 'pedestrian', 'footway', 'path',
            'residential', 'neighbourhood', 'suburb', 'quarter',
        ];

        return [
            'latitude' => (float) $match['lat'],
            'longitude' => (float) $match['lon'],
            'name' => $match['display_name'],
            'state' => $this->stateFromAddress($address),
            'postcode' => $address['postcode'] ?? '',
            'country_code' => $address['country_code'] ?? '',
            'is_specific' => collect($specificFields)->contains(
                fn (string $field) => ! empty($address[$field])
            ),
        ];
    }

    public function reverseStop(float $latitude, float $longitude): array
    {
        $cacheKey = 'osm-reverse:'.md5(round($latitude, 5).':'.round($longitude, 5));
        $cached = Cache::get($cacheKey);
        if ($cached !== null) {
            return $cached;
        }

        try {
            $result = $this->reverseRequest($latitude, $longitude, 'HiddenMY location search');
        } catch (Throwable $exception) {
            report($exception);

            throw new GeocodingException('Unable to identify a location at this point. Please try again.', 502);
        }

        if (empty($result['osm_id']) || empty($result['display_name'])) {
            throw new GeocodingException('No location found at this point. Try clicking closer to a road or landmark.', 404);
        }

        if (strtolower($result['address']['country_code'] ?? '') !== 'my') {
            throw new GeocodingException('That point is outside Malaysia. Please pick a location within the country.', 422);
        }

        $location = [
            'id' => 'osm-'.($result['osm_type'] ?? 'node').'-'.$result['osm_id'],
            'osm_id' => (int) $result['osm_id'],
            'name' => $result['display_name'],
            'latitude' => $latitude,
            'longitude' => $longitude,
            'source' => 'openstreetmap',
        ];

        Cache::put($cacheKey, $location, now()->addHours(self::CACHE_TTL_HOURS));

        return $location;
    }

    public function reverseAddress(float $latitude, float $longitude): array
    {
        try {
            $result = $this->reverseRequest($latitude, $longitude, 'Gemora hidden gem location picker');
        } catch (Throwable $exception) {
            report($exception);

            throw new GeocodingException('Unable to identify this location. Please try again.', 502);
        }

        if (empty($result['display_name'])) {
            throw new GeocodingException('No address found for this location.', 404);
        }

        $details = $result['address'] ?? [];
        $road = $details['road']
            ?? $details['pedestrian']
            ?? $details['footway']
            ?? $details['path']
            ?? $details['residential']
            ?? '';
        $street = trim(($details['house_number'] ?? '').' '.$road);
        $area = $details['neighbourhood'] ?? $details['suburb'] ?? $details['quarter'] ?? '';
        $locality = $details['city']
            ?? $details['town']
            ?? $details['village']
            ?? $details['municipality']
            ?? '';

        return [
            'address' => $this->uniqueAddressParts([$street, $area, $locality]),
            'state' => $this->stateFromAddress($details),
            'postcode' => $details['postcode'] ?? '',
            'latitude' => $latitude,
            'longitude' => $longitude,
        ];
    }

    public function autocomplete(
        string $query,
        ?float $latitude = null,
        ?float $longitude = null,
    ): array {
        $query = trim($query);
        $cacheKey = 'photon-autocomplete:'.md5(strtolower($query));
        $cached = Cache::get($cacheKey);
        if ($cached !== null) {
            return $cached;
        }

        try {
            $features = $this->photon->autocomplete([
                'q' => $query,
                'lang' => 'en',
                'limit' => 15,
                'lat' => $latitude ?? 4.2,
                'lon' => $longitude ?? 102.0,
            ]);
        } catch (Throwable $exception) {
            report($exception);

            throw new GeocodingException(
                'Address lookup is unavailable right now. You can still type the address and use the map.',
                502,
            );
        }

        $suggestions = collect($features)
            ->filter(fn ($feature) => strtoupper((string) data_get($feature, 'properties.countrycode')) === 'MY')
            ->map(fn ($feature) => $this->normalisePhotonFeature($feature))
            ->filter(fn ($suggestion) => $suggestion['latitude'] !== null
                && $suggestion['longitude'] !== null
                && $suggestion['label'] !== '')
            ->unique('label')
            ->take(self::ADDRESS_SUGGESTION_LIMIT)
            ->values()
            ->all();

        Cache::put($cacheKey, $suggestions, now()->addHours(self::CACHE_TTL_HOURS));

        return $suggestions;
    }

    private function reverseRequest(float $latitude, float $longitude, string $userAgent): array
    {
        return $this->nominatim->reverse($latitude, $longitude, $userAgent);
    }

    private function normalisePhotonFeature(array $feature): array
    {
        $properties = $feature['properties'] ?? [];
        $coordinates = $feature['geometry']['coordinates'] ?? [null, null];
        $name = trim((string) ($properties['name'] ?? ''));
        $street = trim(implode(' ', array_filter([
            $properties['housenumber'] ?? null,
            $properties['street'] ?? null,
        ])));

        if ($name !== '' && ($street === '' || stripos($street, $name) === false)) {
            $street = trim($name.($street !== '' ? ', '.$street : ''));
        }

        $locality = trim((string) (
            $properties['district']
            ?? $properties['city']
            ?? $properties['county']
            ?? $properties['locality']
            ?? ''
        ));
        $state = $this->canonicalState($properties['state'] ?? '')
            ?: $this->canonicalState($properties['county'] ?? '')
            ?: $this->canonicalState($properties['city'] ?? '');
        $postcode = trim((string) ($properties['postcode'] ?? ''));
        $address = trim(implode(', ', array_filter([$street, $locality])));
        if ($address === '') {
            $address = $locality !== '' ? $locality : ($name !== '' ? $name : $state);
        }

        return [
            'label' => trim(implode(', ', array_filter([$address, $state, $postcode])), ', '),
            'address' => $address,
            'state' => $state,
            'postcode' => $postcode,
            'latitude' => isset($coordinates[1]) ? (float) $coordinates[1] : null,
            'longitude' => isset($coordinates[0]) ? (float) $coordinates[0] : null,
        ];
    }

    private function stateFromAddress(array $address): string
    {
        foreach (['state', 'region'] as $field) {
            $state = $this->canonicalState($address[$field] ?? '');
            if ($state !== '') {
                return $state;
            }
        }

        // Nominatim may identify federal territories as cities instead of states.
        // Never let a locality override recognized state/region information.
        foreach (['city', 'municipality', 'county'] as $field) {
            $state = $this->canonicalState($address[$field] ?? '');
            if (in_array($state, ['Kuala Lumpur', 'Putrajaya', 'Labuan'], true)) {
                return $state;
            }
        }

        return '';
    }

    private function canonicalState(?string $state): string
    {
        $state = preg_replace('/\s+/u', ' ', trim((string) $state));
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
        foreach ($aliases + array_combine(self::MALAYSIA_STATES, self::MALAYSIA_STATES) as $name => $canonical) {
            if (strcasecmp($state, $name) === 0) {
                return $canonical;
            }
        }

        return '';
    }

    private function uniqueAddressParts(array $parts): string
    {
        $unique = [];
        $seen = [];

        foreach ($parts as $part) {
            $part = trim($part);
            $normalised = strtolower($part);
            if ($part !== '' && ! in_array($normalised, $seen, true)) {
                $unique[] = $part;
                $seen[] = $normalised;
            }
        }

        return implode(', ', $unique);
    }
}
