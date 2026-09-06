<?php

namespace App\Console\Commands\HiddenGems;

use App\Models\Location;
use App\Models\OsmAttraction;
use App\Services\HiddenGems\OsmAttractionCache;
use Illuminate\Console\Command;

class SyncOsmAttractions extends Command
{
    protected $signature = 'osm:sync-attractions
        {--only= : Only sync cells whose key contains this string (for a quick test run)}
        {--delay=1 : Seconds to wait between Overpass calls, to stay a good citizen of a free shared service}';

    protected $description = 'Pre-warm the OSM attractions cache around Malaysia\'s major cities and existing hidden gems.';

    /** [name, lat, lng] — state/federal-territory capitals. */
    private const CITIES = [
        ['Johor Bahru', 1.4927, 103.7414],
        ['Kuala Lumpur', 3.1390, 101.6869],
        ['George Town', 5.4141, 100.3288],
        ['Shah Alam', 3.0733, 101.5185],
        ['Melaka City', 2.1896, 102.2501],
        ['Ipoh', 4.5975, 101.0901],
        ['Kuantan', 3.8168, 103.3260],
        ['Kuching', 1.5535, 110.3593],
        ['Kota Kinabalu', 5.9804, 116.0735],
        ['Kuala Terengganu', 5.3302, 103.1408],
        ['Kota Bharu', 6.1254, 102.2381],
        ['Alor Setar', 6.1214, 100.3673],
        ['Seremban', 2.7297, 101.9381],
        ['Kangar', 6.4414, 100.1986],
        ['Putrajaya', 2.9264, 101.6964],
        ['Labuan', 5.2831, 115.2308],
    ];

    /** 0.05° matches OsmAttractionCache's grid — a 3x3 block covers ~16km across. */
    private const GRID_DEGREES = 0.05;

    public function handle(OsmAttractionCache $cache): int
    {
        $only = $this->option('only');
        $delay = max(0, (int) $this->option('delay'));

        $points = $this->gatherPoints();
        $cellKeys = [];

        foreach ($points as [$label, $lat, $lng]) {
            $key = $cache->gridCellKey($lat, $lng);
            $cellKeys[$key] ??= ['label' => $label, 'lat' => $lat, 'lng' => $lng];
        }

        if ($only) {
            $cellKeys = array_filter($cellKeys, fn ($cell, $key) => str_contains($key, $only) || str_contains($cell['label'], $only), ARRAY_FILTER_USE_BOTH);
        }

        $total = count($cellKeys);
        $this->info("Covering {$total} grid cell(s) across ".count(self::CITIES).' cities + '.Location::count().' hidden gems.');

        $synced = 0;
        $skippedFresh = 0;
        $failed = 0;

        foreach ($cellKeys as $key => $cell) {
            // The whole body — including the freshness check — is inside the
            // try: a run over 165 cells takes long enough that a transient
            // hiccup reaching the database (DNS blip, brief connection drop)
            // is a real possibility, not just an Overpass timeout, and either
            // one should cost this cell a retry next run rather than crashing
            // the rest of the sync.
            try {
                if ($cache->isCellFresh($key)) {
                    $skippedFresh++;

                    continue;
                }

                $this->line("Syncing {$cell['label']} ({$key})...");
                $cache->ensureCellSynced($cell['lat'], $cell['lng'], timeoutSeconds: 25);
                $synced++;
            } catch (\Throwable $exception) {
                $failed++;
                $this->warn("  failed ({$cell['label']} {$key}): {$exception->getMessage()}");
                report($exception);
            }

            if ($delay > 0 && ($synced + $failed) < $total) {
                sleep($delay);
            }
        }

        $this->info("Done. Synced: {$synced}, already fresh: {$skippedFresh}, failed: {$failed}.");
        $this->info('Total attractions cached: '.OsmAttraction::count());

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }

    /**
     * @return array<int, array{0: string, 1: float, 2: float}>
     */
    private function gatherPoints(): array
    {
        $points = [];

        foreach (self::CITIES as [$name, $lat, $lng]) {
            // 3x3 block of cells centered on the city, not just one — a single
            // ~5.5km cell doesn't cover a whole metro area.
            for ($dLat = -1; $dLat <= 1; $dLat++) {
                for ($dLng = -1; $dLng <= 1; $dLng++) {
                    $points[] = [
                        $name,
                        $lat + $dLat * self::GRID_DEGREES,
                        $lng + $dLng * self::GRID_DEGREES,
                    ];
                }
            }
        }

        Location::query()
            ->whereNotNull('latitude')
            ->whereNotNull('longitude')
            ->get(['place_name', 'latitude', 'longitude'])
            ->each(function (Location $location) use (&$points) {
                $points[] = ["gem: {$location->place_name}", (float) $location->latitude, (float) $location->longitude];
            });

        return $points;
    }
}
