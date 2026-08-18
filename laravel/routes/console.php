<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Sweep up hidden gem submissions stuck at 'pending' after a technical AI
// verification failure (Gemini timeout/5xx) and retry them.
Schedule::command('hidden-gems:retry-verification')->everyFiveMinutes();
