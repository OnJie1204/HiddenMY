<?php

namespace App\Console\Commands;

use App\Jobs\VerifyHiddenGemSubmission;
use App\Models\Location;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Stage 1 AI verification (VerifyHiddenGemSubmission) runs inline at submit
 * time and, on a technical failure (Gemini timeout/5xx/malformed response),
 * leaves the submission at status='pending' with a "will be retried" message
 * — but nothing retries it on its own; the only trigger otherwise is the
 * submitter manually editing the gem again. This command is that retry: it
 * finds submissions stuck at 'pending' long enough that they can't still be
 * mid-request, and re-dispatches verification for them, up to a per-gem
 * attempt cap so a permanently-broken submission doesn't retry forever.
 */
class RetryPendingHiddenGemVerifications extends Command
{
    protected $signature = 'hidden-gems:retry-verification
        {--stale-minutes=5 : Only retry submissions whose last update is at least this many minutes old}
        {--limit=50 : Maximum number of submissions to retry in one run}';

    protected $description = 'Re-run AI verification for hidden gem submissions stuck pending after a technical failure.';

    public function handle(): int
    {
        $staleMinutes = max(1, (int) $this->option('stale-minutes'));
        $limit = max(1, (int) $this->option('limit'));

        $candidates = Location::where('status', 'pending')
            ->where('updated_at', '<=', now()->subMinutes($staleMinutes))
            ->where('verification_attempts', '<', VerifyHiddenGemSubmission::MAX_VERIFICATION_ATTEMPTS)
            ->orderBy('updated_at')
            ->limit($limit)
            ->get(['id', 'place_name', 'verification_attempts']);

        if ($candidates->isEmpty()) {
            $this->info('No stuck pending submissions to retry.');

            return self::SUCCESS;
        }

        foreach ($candidates as $location) {
            $this->line("Retrying verification for #{$location->id} \"{$location->place_name}\" (attempt {$location->verification_attempts}/".VerifyHiddenGemSubmission::MAX_VERIFICATION_ATTEMPTS.')...');

            VerifyHiddenGemSubmission::dispatch($location->id);
        }

        $skippedAtCap = Location::where('status', 'pending')
            ->where('updated_at', '<=', now()->subMinutes($staleMinutes))
            ->where('verification_attempts', '>=', VerifyHiddenGemSubmission::MAX_VERIFICATION_ATTEMPTS)
            ->count();

        if ($skippedAtCap > 0) {
            $this->warn("{$skippedAtCap} submission(s) have reached the {$this->maxAttemptsLabel()} retry cap and were left as-is; they'll only retry if the submitter edits them.");
        }

        Log::info('Retried stuck-pending hidden gem verifications.', [
            'retried' => $candidates->count(),
            'skipped_at_cap' => $skippedAtCap,
        ]);

        $this->info("Retried {$candidates->count()} submission(s).");

        return self::SUCCESS;
    }

    private function maxAttemptsLabel(): string
    {
        return (string) VerifyHiddenGemSubmission::MAX_VERIFICATION_ATTEMPTS;
    }
}
