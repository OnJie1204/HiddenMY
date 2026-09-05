<?php

namespace App\Jobs\HiddenGems;

use App\Integrations\Gemini\GeminiClient;
use App\Integrations\Http\RemoteImageFetcher;
use App\Models\LocationImage;
use App\Models\LocationPendingEdit;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Reviews an owner's proposed description / added photos for a verified gem.
 *
 * It does NOT re-run legitimacy / tourism / evidence — the place is already
 * verified real. It checks exactly two things:
 *   1. content_safety — no hate speech, harassment, explicit or graphic material
 *   2. same_place    — the new text + photos still describe the same
 *                      establishment as the locked name / address / coordinates
 *
 * Both pass -> apply (description updated, photos appended). Either fails ->
 * discard, keep the old content, store the reason. A technical failure leaves
 * the row at pending_review for the retry sweep.
 */
class ReviewPendingLocationEdit implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 120;

    private const MAX_IMAGES = 5;

    public function __construct(public int $pendingEditId) {}

    private GeminiClient $gemini;

    private RemoteImageFetcher $remoteImages;

    public function handle(?GeminiClient $gemini = null, ?RemoteImageFetcher $remoteImages = null): void
    {
        $this->gemini = $gemini ?? app(GeminiClient::class);
        $this->remoteImages = $remoteImages ?? app(RemoteImageFetcher::class);

        $edit = LocationPendingEdit::with('location.images')->find($this->pendingEditId);

        if (! $edit || ! $edit->isPending()) {
            return;
        }

        $location = $edit->location;
        if (! $location || $location->isDeleted()) {
            $edit->update(['status' => LocationPendingEdit::STATUS_REJECTED, 'ai_reason' => 'The gem is no longer available.', 'reviewed_at' => now()]);

            return;
        }

        if (! $this->gemini->configured()) {
            Log::warning('Skipping pending-edit review: GEMINI_API_KEY not set.');

            return; // stays pending_review — retry sweep will pick it up
        }

        try {
            $parsed = $this->askGemini($edit);
        } catch (Throwable $e) {
            Log::warning('Pending-edit review failed technically — will retry.', [
                'pending_edit_id' => $edit->id,
                'error' => $e->getMessage(),
            ]);

            return; // stays pending_review
        }

        $safety = strtoupper((string) ($parsed['content_safety'] ?? 'CLEAR'));
        $samePlace = (bool) ($parsed['same_place'] ?? false);
        $reason = trim((string) ($parsed['reason'] ?? ''));

        if ($safety === 'UNSAFE') {
            $this->reject($edit, 'The new description or photos contain content that does not meet HiddenMY\'s standards.'.($reason ? ' '.$reason : ''));

            return;
        }

        if (! $samePlace) {
            $this->reject($edit, 'The new description does not match the verified place.'.($reason ? ' '.$reason : ''));

            return;
        }

        $this->apply($edit);
    }

    private function apply(LocationPendingEdit $edit): void
    {
        $location = $edit->location;

        if ($edit->proposed_description !== null && $edit->proposed_description !== '') {
            $location->update(['description' => $edit->proposed_description]);
        }

        foreach (($edit->proposed_image_urls ?? []) as $url) {
            LocationImage::create(['location_id' => $location->id, 'image_url' => $url]);
        }

        $edit->update([
            'status' => LocationPendingEdit::STATUS_APPLIED,
            'ai_reason' => null,
            'reviewed_at' => now(),
        ]);
    }

    private function reject(LocationPendingEdit $edit, string $reason): void
    {
        $edit->update([
            'status' => LocationPendingEdit::STATUS_REJECTED,
            'ai_reason' => Str::limit($reason, 500),
            'reviewed_at' => now(),
        ]);
    }

    private function askGemini(LocationPendingEdit $edit): array
    {
        $location = $edit->location;

        $parts = [[
            'text' => $this->prompt($location, $edit->proposed_description),
        ]];

        // Original photos first (the reference), then the proposed additions.
        $urls = collect($location->images->pluck('image_url'))
            ->merge($edit->proposed_image_urls ?? [])
            ->filter()
            ->take(self::MAX_IMAGES);

        foreach ($urls as $url) {
            $inline = $this->downloadImage($url);
            if ($inline) {
                $parts[] = ['inline_data' => $inline];
            }
        }

        $response = $this->gemini->generateContent([
            'contents' => [['parts' => $parts]],
            'generationConfig' => [
                'temperature' => 0,
                'response_mime_type' => 'application/json',
                'response_schema' => [
                    'type' => 'object',
                    'properties' => [
                        'content_safety' => ['type' => 'string', 'enum' => ['CLEAR', 'BORDERLINE', 'UNSAFE']],
                        'same_place' => ['type' => 'boolean'],
                        'reason' => ['type' => 'string'],
                    ],
                    'required' => ['content_safety', 'same_place', 'reason'],
                ],
            ],
        ], timeout: 45, attempts: 2, sleepMilliseconds: 1500);

        $text = $response->json('candidates.0.content.parts.0.text');
        $decoded = json_decode((string) $text, true);

        if (! is_array($decoded)) {
            throw new \RuntimeException('Gemini returned an unusable pending-edit review.');
        }

        return $decoded;
    }

    private function prompt($location, ?string $proposedDescription): string
    {
        $name = $location->place_name;
        $addr = trim($location->address.', '.$location->state.' '.$location->postcode);
        $coords = $location->latitude.', '.$location->longitude;
        $current = $location->description ?: '(none)';
        $proposed = $proposedDescription ?: '(unchanged)';

        return <<<PROMPT
        You are reviewing an owner's proposed edit to an ALREADY-VERIFIED place on HiddenMY.
        The place's identity is fixed and cannot change:
          Name: {$name}
          Address: {$addr}
          Coordinates: {$coords}

        Current description: {$current}
        Proposed new description: {$proposed}

        The first images are the original verified photos; any images after them are the
        owner's proposed additions.

        Judge two things only:
        - content_safety: does the proposed description text OR any proposed photo contain
          hate speech, harassment, sexual/explicit material, or gratuitously graphic
          violence? CLEAR / BORDERLINE / UNSAFE. Judge the content, not the subject — a
          dark or serious topic written about plainly is CLEAR.
        - same_place: does the proposed description still describe the SAME establishment at
          the fixed name / address / coordinates? A description that has genuinely evolved
          (new menu focus, renovated, more detail) is still the same place = true. A
          description that turns it into a different business or a wildly different category
          = false.

        Respond only with the requested JSON.
        PROMPT;
    }

    private function downloadImage(string $url): ?array
    {
        try {
            return $this->remoteImages->inlineData($url);
        } catch (Throwable $e) {
            return null;
        }
    }
}
