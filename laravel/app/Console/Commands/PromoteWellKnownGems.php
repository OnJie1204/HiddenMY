<?php

namespace App\Console\Commands;

use App\Models\Location;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * A Hidden Gem that the community has clearly outgrown — enough people have
 * tagged it in travel posts and rated it that it is no longer "hidden" —
 * is promoted to the 'well_known' status.
 *
 * Signal: (# travel-post tags) + (# ratings) >= WELL_KNOWN_THRESHOLD, counting
 * everything (no de-duplication by user). One-way ratchet — a well-known place
 * never drops back to hidden_gem. It keeps every vote, rating, post tag and
 * achievement credit; only its status and where it is displayed change.
 */
class PromoteWellKnownGems extends Command
{
    protected $signature = 'well-known:promote
        {--limit=200 : Maximum number of gems to promote in one run}
        {--dry-run : List what would be promoted without changing anything}';

    protected $description = 'Promote Hidden Gems that have crossed the well-known threshold (post tags + ratings).';

    public function handle(): int
    {
        $threshold = Location::WELL_KNOWN_THRESHOLD;
        $limit = max(1, (int) $this->option('limit'));
        $dryRun = (bool) $this->option('dry-run');

        $candidates = Location::query()
            ->where('status', Location::STATUS_HIDDEN_GEM)
            ->withCount(['posts', 'ratings'])
            ->get(['id', 'place_name'])
            ->map(function (Location $gem) {
                $gem->well_known_score = (int) $gem->posts_count + (int) $gem->ratings_count;
                return $gem;
            })
            ->filter(fn (Location $gem) => $gem->well_known_score >= $threshold)
            ->sortByDesc('well_known_score')
            ->take($limit)
            ->values();

        if ($candidates->isEmpty()) {
            $this->info('No gems have crossed the well-known threshold.');

            return self::SUCCESS;
        }

        foreach ($candidates as $gem) {
            $this->line(($dryRun ? '[dry-run] ' : '')
                . "#{$gem->id} \"{$gem->place_name}\" — score {$gem->well_known_score} "
                . "({$gem->posts_count} tags + {$gem->ratings_count} ratings) >= {$threshold}");
        }

        if ($dryRun) {
            $this->info("{$candidates->count()} gem(s) would be promoted.");

            return self::SUCCESS;
        }

        $ids = $candidates->pluck('id')->all();

        DB::table('locations')
            ->whereIn('id', $ids)
            ->where('status', Location::STATUS_HIDDEN_GEM)
            ->update([
                'status' => Location::STATUS_WELL_KNOWN,
                'updated_at' => now(),
            ]);

        Log::info('Promoted gems to well-known.', ['ids' => $ids]);
        $this->info("Promoted {$candidates->count()} gem(s) to well-known.");

        return self::SUCCESS;
    }
}
