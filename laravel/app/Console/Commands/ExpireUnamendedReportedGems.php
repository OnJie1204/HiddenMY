<?php

namespace App\Console\Commands;

use App\Models\Location;
use App\Models\Report;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class ExpireUnamendedReportedGems extends Command
{
    protected $signature = 'reports:expire-unamended
        {--limit=100 : Maximum number of gems to expire in one run}';

    protected $description = 'Soft-delete gems whose upheld, amendable report expired without a successful fix.';

    public function handle(): int
    {
        $limit = max(1, (int) $this->option('limit'));

        $expired = Report::whereNull('parent_report_id')
            ->whereIn('reason', Report::AMENDABLE_REASONS)
            ->where('status', 'upheld')
            ->whereNotNull('delete_at')
            ->where('delete_at', '<=', now())
            ->whereHas('location', fn ($query) => $query->where('status', 'delisted'))
            ->with('location')
            ->limit($limit)
            ->get();

        if ($expired->isEmpty()) {
            $this->info('No expired reported gems to remove.');

            return self::SUCCESS;
        }

        foreach ($expired as $report) {
            $location = $report->location;

            if (!$location) {
                continue;
            }

            $this->line("Removing #{$location->id} \"{$location->place_name}\" — 30-day fix window expired (report #{$report->id}).");

            $location->update(['status' => 'deleted']);
            $report->update(['status' => 'expired', 'resolved_at' => now()]);
        }

        Log::info('Expired unamended reported gems.', ['count' => $expired->count()]);

        $this->info("Removed {$expired->count()} gem(s) whose report window expired.");

        return self::SUCCESS;
    }
}
