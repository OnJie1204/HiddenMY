<?php

namespace App\Jobs\HiddenGems;

use App\Models\LocationPendingEdit;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Rejects legacy verified-content edit jobs that were queued before the
 * description/photo proposal flow was disabled.
 */
class ReviewPendingLocationEdit implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public function __construct(public int $pendingEditId) {}

    public function handle(): void
    {
        $edit = LocationPendingEdit::find($this->pendingEditId);

        if (! $edit || ! $edit->isPending()) {
            return;
        }

        $edit->update([
            'status' => LocationPendingEdit::STATUS_REJECTED,
            'ai_reason' => 'Verified Hidden Gems can only update contact information.',
            'reviewed_at' => now(),
        ]);
    }
}
