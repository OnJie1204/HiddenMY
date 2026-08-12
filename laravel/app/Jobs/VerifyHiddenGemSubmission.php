<?php

namespace App\Jobs;

use App\Models\Location;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class VerifyHiddenGemSubmission implements ShouldQueue
{
    use Queueable;

    private const MODEL = 'gemini-2.5-flash';

    private const MAX_IMAGES = 5;

    public function __construct(public int $locationId)
    {
    }

    /**
     * Ask Gemini to screen a hidden gem submission for spam/policy violations
     * and description-image-category plausibility, then move it to
     * verified/rejected, or leave it pending for community voting when the
     * model can't tell.
     */
    public function handle(): void
    {
        $location = Location::with(['images', 'category'])->find($this->locationId);

        if (! $location || ! $location->isPending()) {
            return;
        }

        $apiKey = config('services.gemini.key');

        if (! $apiKey) {
            Log::warning('Skipping hidden gem AI verification: GEMINI_API_KEY is not set.');

            return;
        }

        try {
            $response = Http::withHeaders(['x-goog-api-key' => $apiKey])
                ->timeout(30)
                ->post(
                    'https://generativelanguage.googleapis.com/v1beta/models/'.self::MODEL.':generateContent',
                    [
                        'contents' => [
                            [
                                'role' => 'user',
                                'parts' => $this->buildParts($location),
                            ],
                        ],
                        'systemInstruction' => [
                            'parts' => [
                                ['text' => $this->systemPrompt()],
                            ],
                        ],
                        'generationConfig' => [
                            'response_mime_type' => 'application/json',
                            'response_schema' => [
                                'type' => 'object',
                                'properties' => [
                                    'verdict' => [
                                        'type' => 'string',
                                        'enum' => ['approve', 'reject', 'uncertain'],
                                    ],
                                    'reason' => ['type' => 'string'],
                                ],
                                'required' => ['verdict', 'reason'],
                            ],
                        ],
                    ]
                )
                ->throw();
        } catch (\Throwable $e) {
            Log::warning('Hidden gem AI verification request failed.', [
                'location_id' => $location->id,
                'error' => $e->getMessage(),
            ]);

            return;
        }

        $text = $response->json('candidates.0.content.parts.0.text');
        $parsed = json_decode((string) $text, true);
        $verdict = $parsed['verdict'] ?? null;
        $reason = $parsed['reason'] ?? null;

        $status = match ($verdict) {
            'approve' => 'verified',
            'reject' => 'rejected',
            default => 'pending',
        };

        $location->update([
            'status' => $status,
            'ai_review_reason' => $reason,
            'ai_reviewed_at' => now(),
        ]);
    }

    private function systemPrompt(): string
    {
        return <<<'PROMPT'
        You are a pre-screening reviewer for a Malaysian travel app's "hidden gem" submissions.
        A hidden gem is, by definition, a real place that does NOT show up on Google Maps or
        other mainstream search/maps services — so you cannot and should not try to verify that
        it "exists" by matching it against your own knowledge or an internet search. Your job is
        narrower: catch spam, gibberish, offensive content, and submissions whose photos or
        description are implausible or inconsistent, not to fact-check the place.

        Approve ("approve") when the place name, address/state, category, and description are
        internally consistent and read like a genuine description of a real small place, and any
        photos plausibly depict an outdoor location or venue consistent with that description.

        Reject ("reject") only for clear policy violations or bad-faith submissions: spam or
        promotional gibberish, offensive/inappropriate text or images, a description that is
        empty of real content (e.g. keyboard mashing, placeholder text, copy-pasted lorem ipsum),
        or photos that are obviously unrelated to any real place (memes, screenshots, stock
        photos of an unrelated location, people's faces with no location context).

        Use "uncertain" when the submission is plausible but you can't confidently tell either
        way (e.g. no photos were provided and the description is thin but not obviously fake).
        Submissions marked "uncertain" stay pending for community review, so prefer "uncertain"
        over guessing.

        Always include a one or two sentence reason a human moderator could read to understand
        your call. Respond only with the requested JSON.
        PROMPT;
    }

    private function buildParts(Location $location): array
    {
        $parts = [
            [
                'text' => sprintf(
                    "Place name: %s\nCategory: %s\nState: %s\nAddress: %s\nDescription: %s",
                    $location->place_name,
                    $location->category->name ?? 'Unknown',
                    $location->state,
                    $location->address,
                    $location->description,
                ),
            ],
        ];

        foreach ($location->images->take(self::MAX_IMAGES) as $image) {
            $inline = $this->downloadImageAsInlineData($image->image_url);

            if ($inline) {
                $parts[] = ['inline_data' => $inline];
            }
        }

        return $parts;
    }

    /**
     * Gemini's generateContent endpoint only accepts inline base64 image
     * data (or a File API URI) — not an arbitrary public URL — so each
     * submission photo has to be downloaded and re-encoded here.
     */
    private function downloadImageAsInlineData(string $url): ?array
    {
        try {
            $response = Http::timeout(15)->get($url)->throw();
        } catch (\Throwable $e) {
            Log::warning('Failed to download hidden gem image for AI verification.', [
                'url' => $url,
                'error' => $e->getMessage(),
            ]);

            return null;
        }

        $mimeType = $response->header('Content-Type') ?: 'image/jpeg';

        return [
            'mime_type' => explode(';', $mimeType)[0],
            'data' => base64_encode($response->body()),
        ];
    }
}
