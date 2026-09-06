<?php

namespace App\Services\HiddenGems;

use App\Models\Location;
use App\Support\Geo;

class DuplicateDetectionService
{
    private const CONFIRMED_NAME_SIMILARITY = 0.85;

    private const CONFIRMED_DISTANCE_METERS = 150;

    private const EXACT_NAME_DISTANCE_METERS = 500;

    private const POSSIBLE_NAME_SIMILARITY = 0.6;

    private const POSSIBLE_DISTANCE_METERS = 1000;

    private const SAME_SPOT_DISTANCE_METERS = 50;

    /**
     * Compare a submission against existing (non-deleted) locations in the same
     * state and classify it as NO_DUPLICATE / POSSIBLE_DUPLICATE / CONFIRMED_DUPLICATE.
     *
     * Runs before any Gemini call so a confirmed duplicate can short-circuit and
     * skip the AI request entirely (cost saving).
     *
     * @return array{status: string, location: ?Location, name_similarity: float, distance_meters: ?float}
     */
    public function detect(Location $location): array
    {
        $best = [
            'status' => 'NO_DUPLICATE',
            'location' => null,
            'name_similarity' => 0.0,
            'distance_meters' => null,
        ];

        if ($location->latitude === null || $location->longitude === null) {
            return $best;
        }

        // No classify() branch can ever return anything but NO_DUPLICATE past
        // POSSIBLE_DISTANCE_METERS, so pre-filtering to a bounding box at the
        // DB level avoids loading every location in the state (which does not
        // scale) while never excluding a genuine candidate.
        [$minLat, $maxLat, $minLon, $maxLon] = Geo::boundingBox(
            (float) $location->latitude,
            (float) $location->longitude,
            self::POSSIBLE_DISTANCE_METERS,
        );

        // Only live places count as duplicates: a submission still pending, one
        // in community voting, a confirmed Hidden Gem, or a well-known place. An
        // ai_rejected or deleted row never blocks a resubmission, and neither
        // does a permanently-closed place — a closed spot can be resubmitted
        // (an accepted design consequence: two rows for one physical place).
        $candidates = Location::where('id', '!=', $location->id)
            ->whereIn('status', ['pending', 'pending_community_vote', 'hidden_gem', 'well_known'])
            ->whereNull('permanently_closed_at')
            ->where('state', $location->state)
            ->whereBetween('latitude', [$minLat, $maxLat])
            ->whereBetween('longitude', [$minLon, $maxLon])
            ->get();

        $normalizedName = $this->normalize($location->place_name);

        foreach ($candidates as $candidate) {
            if ($candidate->latitude === null || $candidate->longitude === null) {
                continue;
            }

            $candidateNormalizedName = $this->normalize($candidate->place_name);
            $nameSimilarity = $this->nameSimilarity($normalizedName, $candidateNormalizedName);
            $distance = Geo::distanceMeters(
                (float) $location->latitude,
                (float) $location->longitude,
                (float) $candidate->latitude,
                (float) $candidate->longitude,
            );

            $status = $this->classify($nameSimilarity, $distance, $normalizedName, $candidateNormalizedName);

            if ($this->rank($status) > $this->rank($best['status'])) {
                $best = [
                    'status' => $status,
                    'location' => $candidate,
                    'name_similarity' => $nameSimilarity,
                    'distance_meters' => $distance,
                ];

                if ($status === 'CONFIRMED_DUPLICATE') {
                    break;
                }
            }
        }

        return $best;
    }

    private function classify(float $nameSimilarity, float $distanceMeters, string $nameA, string $nameB): string
    {
        $exactName = $nameA !== '' && $nameA === $nameB;

        if (($nameSimilarity >= self::CONFIRMED_NAME_SIMILARITY && $distanceMeters <= self::CONFIRMED_DISTANCE_METERS)
            || ($exactName && $distanceMeters <= self::EXACT_NAME_DISTANCE_METERS)) {
            return 'CONFIRMED_DUPLICATE';
        }

        if (($nameSimilarity >= self::POSSIBLE_NAME_SIMILARITY && $distanceMeters <= self::POSSIBLE_DISTANCE_METERS)
            || $distanceMeters <= self::SAME_SPOT_DISTANCE_METERS) {
            return 'POSSIBLE_DUPLICATE';
        }

        return 'NO_DUPLICATE';
    }

    private function rank(string $status): int
    {
        return match ($status) {
            'CONFIRMED_DUPLICATE' => 2,
            'POSSIBLE_DUPLICATE' => 1,
            default => 0,
        };
    }

    private function normalize(?string $value): string
    {
        $value = strtolower((string) $value);
        $value = preg_replace('/[^a-z0-9\s]/', '', $value) ?? '';

        return trim(preg_replace('/\s+/', ' ', $value) ?? '');
    }

    /**
     * 0.0 (completely different) to 1.0 (identical), via PHP's built-in
     * percentage-of-matching-characters similarity measure.
     */
    private function nameSimilarity(string $a, string $b): float
    {
        if ($a === '' || $b === '') {
            return 0.0;
        }

        similar_text($a, $b, $percent);

        return $percent / 100;
    }
}
