<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Sweep up hidden gem submissions stuck at 'pending' after a technical AI
// verification failure (Gemini timeout/5xx) and retry them. Also the safety
// net if the queue worker below is not running.
Schedule::command('hidden-gems:retry-verification')->everyFiveMinutes();

// Drain queued jobs (AI verification) in one short pass per minute, so the
// deployment needs a working scheduler cron but NOT a long-running worker
// process. Skipped entirely when QUEUE_CONNECTION=sync (jobs run inline, so
// there is nothing to drain).
if (config('queue.default') !== 'sync') {
    Schedule::command('queue:work --stop-when-empty --max-time=55 --tries=1')
        ->everyMinute()
        ->withoutOverlapping();
}

// Re-run daily rather than once: Overpass is unreliable enough that a single
// pass reliably leaves some cells failed (timeouts, 5xx) — each cell that
// failed stays un-synced and gets retried on the next run, so gaps close over
// a few days instead of needing someone to notice and re-run it by hand.
Schedule::command('osm:sync-attractions --delay=2')->daily();

// The 30-day amend-or-remove deadline on an upheld, amendable report
// (currently just inappropriate_content) — checked daily is plenty since the
// deadline itself is measured in days, not minutes.
Schedule::command('reports:expire-unamended')->daily();
