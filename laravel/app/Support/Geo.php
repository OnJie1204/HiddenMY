<?php

namespace App\Support;

class Geo
{
    private const EARTH_RADIUS_METERS = 6371000;

    /**
     * Great-circle distance between two coordinates, in meters.
     */
    public static function distanceMeters(float $lat1, float $lon1, float $lat2, float $lon2): float
    {
        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);

        $a = sin($dLat / 2) ** 2
            + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon / 2) ** 2;

        return self::EARTH_RADIUS_METERS * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }

    /**
     * Rectangular lat/lng bounds fully containing every point within
     * $radiusMeters of the given coordinate — a cheap DB-level pre-filter to
     * run before an exact haversine check. Safe as a pre-filter because the
     * box's corners are always farther out than the circle, never closer, so
     * it never excludes a point that the exact distance check would include.
     *
     * @return array{0: float, 1: float, 2: float, 3: float} [minLat, maxLat, minLon, maxLon]
     */
    public static function boundingBox(float $lat, float $lon, float $radiusMeters): array
    {
        $metersPerDegreeLat = self::EARTH_RADIUS_METERS * M_PI / 180;
        $latDelta = $radiusMeters / $metersPerDegreeLat;

        $metersPerDegreeLon = $metersPerDegreeLat * max(cos(deg2rad($lat)), 0.000001);
        $lonDelta = $radiusMeters / $metersPerDegreeLon;

        return [$lat - $latDelta, $lat + $latDelta, $lon - $lonDelta, $lon + $lonDelta];
    }
}
