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
}
