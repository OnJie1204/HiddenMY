<?php

namespace App\Jobs;

use App\Models\Location;
use App\Services\DuplicateDetectionService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Stage 1 of HiddenMY's two-stage verification: the AI decides ONLY whether a
 * submission is sufficiently hidden (low Google visibility) and legitimate to
 * be worth putting in front of the community — never the final "is this a
 * Hidden Gem" call, which Stage 2 (community voting, see VoteController)
 * makes. Outcomes: 'pending_community_vote' (proceed to voting) or
 * 'ai_rejected' (doesn't qualify). A technical failure never produces
 * 'ai_rejected' — it leaves the location at 'pending' for a retry.
 */
class VerifyHiddenGemSubmission implements ShouldQueue
{
    use Queueable;

    /**
     * We run our own model-fallback + retry policy inside handle(); the queue
     * must never re-run the whole job (that would re-bill every Gemini call
     * and could double-write the result).
     */
    public int $tries = 1;

    /** Worst-case ceiling: Call A + Call B, each with retries and a fallback
     *  model, plus up to 5 image downloads. */
    public int $timeout = 240;

    // The model is configurable (config/services.php -> GEMINI_MODEL /
    // GEMINI_FALLBACK_MODEL) so a Google deprecation or capacity outage is a
    // .env change, not a code deploy. A dated snapshot (e.g. 'gemini-2.5-flash')
    // 404s once Google retires it for a key; even the 'gemini-flash-latest'
    // rolling alias went to persistent 503 in Aug 2026. This is the last-resort
    // default if config and env are both somehow empty.
    private const DEFAULT_MODEL = 'gemini-3.6-flash';

    private const MAX_IMAGES = 5;

    private const DESCRIPTION_LIMIT = 800;

    /** Weighted-score decision threshold: >= this proceeds to community voting. */
    private const PASS_SCORE = 60;

    /** After this many technical-failure attempts, the scheduled retry command stops auto-retrying a submission (it still stays 'pending' and can always be retried by editing it). */
    public const MAX_VERIFICATION_ATTEMPTS = 5;

    /** hiddenness_score, PHP-computed from google_visibility_level per the fixed table (never taken from Gemini's own number). */
    private const HIDDENNESS_BY_VISIBILITY = [
        'VERY_LOW' => 100,
        'LOW' => 80,
        'MODERATE' => 50,
        'HIGH' => 20,
        'VERY_HIGH' => 0,
    ];

    private const VALID_VISIBILITY_LEVELS = ['VERY_LOW', 'LOW', 'MODERATE', 'HIGH', 'VERY_HIGH'];

    private const VALID_QUALITY_LEVELS = ['STRONG', 'MODERATE', 'WEAK', 'INSUFFICIENT'];

    private const VALID_DUPLICATE_STATUSES = ['NO_DUPLICATE', 'POSSIBLE_DUPLICATE', 'CONFIRMED_DUPLICATE'];

    /**
     * Gemini frequently returns 503 ("currently experiencing high demand") or
     * 429 (rate limit) under normal load — these are transient, not a sign
     * the request itself is bad, so they're worth one immediate retry rather
     * than immediately failing the whole submission back to 'pending' and
     * waiting for the next scheduled retry pass.
     */
    private const RETRYABLE_HTTP_STATUSES = [429, 500, 502, 503, 504];

    public function __construct(public int $locationId)
    {
    }

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

        $duplicate = (new DuplicateDetectionService())->detect($location);

        if ($duplicate['status'] === 'CONFIRMED_DUPLICATE') {
            $match = $duplicate['location'];

            $location->update([
                'status' => 'ai_rejected',
                'duplicate_status' => 'CONFIRMED_DUPLICATE',
                'duplicate_of_location_id' => $match?->id,
                'ai_review_reason' => $match
                    ? "This appears to be a duplicate of an existing submission, \"{$match->place_name}\"."
                    : 'This appears to be a duplicate of an existing submission.',
                'ai_reviewed_at' => now(),
            ]);

            return;
        }

        try {
            $research = $this->runVisibilityResearch($apiKey, $location);
            $scoring = $this->runStructuredScoring($apiKey, $location, $research['text'], $duplicate);

            $this->applyResult(
                $location,
                $scoring['parsed'],
                $duplicate,
                $research['unknown'],
                $scoring['model'],
            );
        } catch (Throwable $e) {
            $this->markPendingOnFailure($location, $e->getMessage());
        }
    }

    // ==================== STAGE 1 PIPELINE ====================

    /**
     * Call A: grounded Google Search research, plain text (no JSON schema —
     * Gemini's Search grounding tool and structured JSON output cannot be
     * used together in one request). Failure here doesn't fail the job; it
     * just falls through to Call B with visibility treated as unknown.
     *
     * @return array{text: ?string, unknown: bool}
     */
    private function runVisibilityResearch(string $apiKey, Location $location): array
    {
        try {
            $result = $this->postToGemini(
                $apiKey,
                fn (string $model) => [
                    'contents' => [
                        [
                            'role' => 'user',
                            'parts' => [['text' => $this->visibilityResearchPrompt($location)]],
                        ],
                    ],
                    'tools' => [
                        ['google_search' => (object) []],
                    ],
                ],
                20,
            );
        } catch (Throwable $e) {
            Log::warning('Hidden gem Google visibility research failed; falling back to unknown visibility.', [
                'location_id' => $location->id,
                'error' => $e->getMessage(),
            ]);

            return ['text' => null, 'unknown' => true];
        }

        $parts = $result['response']->json('candidates.0.content.parts') ?? [];
        $text = collect($parts)->pluck('text')->filter()->implode("\n");

        return $text === ''
            ? ['text' => null, 'unknown' => true]
            : ['text' => $text, 'unknown' => false];
    }

    /**
     * Call B: structured JSON scoring — legitimacy/tourism/evidence assessment
     * plus the model's own read of Call A's research, informed by the PHP-side
     * duplicate check. Tries the configured models in order; a 200 whose body
     * isn't usable JSON is retried like a transient failure before moving on.
     * Throws if every model is exhausted (handle()'s catch then leaves the
     * submission 'pending' for a later retry — never 'ai_rejected').
     *
     * @return array{parsed: array, model: string}
     */
    private function runStructuredScoring(
        string $apiKey,
        Location $location,
        ?string $groundingText,
        array $duplicate
    ): array {
        // Build the multimodal parts (incl. image downloads) once, not per retry.
        $parts = $this->buildScoringParts($location, $groundingText, $duplicate);

        $result = $this->postToGemini(
            $apiKey,
            fn (string $model) => [
                'contents' => [
                    ['role' => 'user', 'parts' => $parts],
                ],
                'systemInstruction' => [
                    'parts' => [['text' => $this->scoringSystemPrompt()]],
                ],
                'generationConfig' => [
                    'response_mime_type' => 'application/json',
                    'response_schema' => $this->scoringResponseSchema(),
                ],
            ],
            30,
            fn (Response $response): bool => $this->extractScoringResult($response) !== null,
        );

        return [
            'parsed' => $this->extractScoringResult($result['response']),
            'model' => $result['model'],
        ];
    }

    /**
     * Pull the validated scoring array out of a Call B response, or null if the
     * body is unusable: no text (safety-filtered), malformed JSON, or a schema
     * mismatch. Used both as the retry validator and to read the final result.
     */
    private function extractScoringResult(Response $response): ?array
    {
        $text = $response->json('candidates.0.content.parts.0.text');

        if (! is_string($text) || $text === '') {
            return null;
        }

        return $this->validateScoringResponse($this->decodeJson($text));
    }

    private function applyResult(Location $location, array $parsed, array $duplicate, bool $visibilityUnknown, string $model): void
    {
        // Even when live Search grounding failed, Call B was still asked for its
        // own best-effort visibility read (it has general knowledge of famous
        // places regardless of live search) — use that rather than discarding
        // it in favor of a blind neutral default, which previously let famous
        // landmarks slip through on legitimacy/evidence alone whenever
        // grounding happened to fail.
        $hiddenness = self::HIDDENNESS_BY_VISIBILITY[$parsed['google_visibility']['level']];

        $legitimacy = $this->clampScore($parsed['legitimacy']['score']);
        $tourism = $this->clampScore($parsed['tourism_value']['score']);
        $evidence = $this->clampScore($parsed['evidence']['score']);

        $weighted = (int) round($hiddenness * 0.40 + $legitimacy * 0.25 + $tourism * 0.20 + $evidence * 0.15);

        $inMalaysia = $parsed['in_malaysia'] && $this->isWithinMalaysiaBoundingBox(
            (float) $location->latitude,
            (float) $location->longitude
        );

        $status = match (true) {
            ! $inMalaysia => 'ai_rejected',
            $weighted >= self::PASS_SCORE => 'pending_community_vote',
            default => 'ai_rejected',
        };

        $reason = $status === 'ai_rejected' && ! $inMalaysia
            ? 'This submission does not appear to be located in Malaysia.'
            : ($parsed['reason'] ?? '');

        // A possible (unconfirmed) duplicate from the PHP check is stored for
        // reference but never forces a status on its own — only Gemini's own
        // score and the hard Malaysia override do.
        //
        // The stored duplicate_status is sourced only from the PHP-side check,
        // never from $parsed['duplicate']['status']: Gemini is never given
        // candidate location IDs to match against, so its own duplicate read
        // has no location to back it — storing it here would produce a
        // duplicate_status with a null duplicate_of_location_id, which any
        // consumer of this field would reasonably assume is always populated.
        $duplicateStatus = $duplicate['status'];

        // Without live grounding, the visibility read is Gemini's own general
        // knowledge rather than a verified search result — reflect that with a
        // capped confidence rather than trusting it as fully as a grounded read.
        $confidence = $this->clampScore($parsed['confidence'] ?? 50);
        if ($visibilityUnknown) {
            $confidence = min($confidence, 70);
        }

        $location->update([
            'status' => $status,
            'verification_score' => $weighted,
            'verification_confidence' => $confidence,
            'google_visibility_level' => $parsed['google_visibility']['level'],
            'hiddenness_score' => $hiddenness,
            'legitimacy_score' => $legitimacy,
            'legitimacy_level' => $parsed['legitimacy']['level'],
            'tourism_value_score' => $tourism,
            'tourism_value_level' => $parsed['tourism_value']['level'],
            'evidence_score' => $evidence,
            'evidence_level' => $parsed['evidence']['level'],
            'duplicate_status' => $duplicateStatus,
            'duplicate_of_location_id' => $duplicate['location']?->id,
            'ai_review_reason' => Str::limit($reason, 500),
            'ai_reviewed_at' => now(),
            'verification_result_json' => $parsed,
            'verification_model' => $model,
            'verification_attempts' => 0,
        ]);
    }

    private function markPendingOnFailure(Location $location, string $technicalError): void
    {
        Log::warning('Hidden gem AI verification failed; leaving submission pending for retry.', [
            'location_id' => $location->id,
            'error' => $technicalError,
            'attempt' => $location->verification_attempts + 1,
        ]);

        // Clear every AI-derived field from a prior review cycle rather than
        // just status/reason — otherwise a failed retry after an edit leaves
        // stale scores/duplicate info on screen that no longer correspond to
        // the current submission content.
        $location->update([
            'status' => 'pending',
            'ai_review_reason' => 'Automated verification could not be completed and will be retried.',
            'verification_attempts' => $location->verification_attempts + 1,
            'verification_score' => null,
            'verification_confidence' => null,
            'google_visibility_level' => null,
            'hiddenness_score' => null,
            'legitimacy_score' => null,
            'legitimacy_level' => null,
            'tourism_value_score' => null,
            'tourism_value_level' => null,
            'evidence_score' => null,
            'evidence_level' => null,
            'duplicate_status' => null,
            'duplicate_of_location_id' => null,
            'verification_result_json' => null,
            'verification_model' => null,
            'ai_reviewed_at' => null,
        ]);
    }

    // ==================== PROMPTS & SCHEMA ====================

    private function visibilityResearchPrompt(Location $location): string
    {
        return sprintf(
            <<<'PROMPT'
            You are researching Google's visibility of a place in Malaysia for a "hidden gem" app.
            Search Google for this place using ALL of the following name variations, since users
            may submit a place under a local, informal, shortened, or non-English name that differs
            from any name it has on Google:
              1. The exact submitted name.
              2. The name + the submitted district/city (if discernible from the address).
              3. The name + the submitted state.
              4. The name + "Malaysia".
              5. The name + any nearby landmark mentioned in the address/description.
              6. Any alternate, local-language (Malay/Chinese/Tamil), or informal name that the
                 description itself suggests, if any.

            Submitted place: %s
            Category: %s
            State: %s
            Address: %s
            Description: %s

            For each variation that returns results, check carefully whether a result is genuinely
            THIS place (matching location/context) and not a different, similarly-named place — do
            not count an unrelated same-name result as a match.

            Report in plain prose (not JSON):
            - Which name variations returned a plausible match, and what those results show
              (e.g. official website, review site, social media page, business directory, news
              article, or nothing at all).
            - Whether the place appears on Google Maps.
            - A one-line visibility read: VERY_LOW (no genuine matches anywhere), LOW (only
              minor/incidental mentions), MODERATE (some presence e.g. a few reviews or a
              directory listing), HIGH (well-indexed with photos/reviews), or VERY_HIGH
              (a well-known, mainstream destination).
            Do not decide whether the place is a "hidden gem" — that judgment happens later.
            PROMPT,
            $location->place_name,
            $location->category->name ?? 'Unknown',
            $location->state,
            $location->address,
            Str::limit($location->description, self::DESCRIPTION_LIMIT),
        );
    }

    private function scoringSystemPrompt(): string
    {
        return <<<'PROMPT'
        You are the Stage 1 automated screener for HiddenMY, a Malaysian "hidden gem" app.
        Your ONLY job is to judge whether a submitted place is sufficiently HIDDEN (low Google
        visibility) and LEGITIMATE enough to be worth putting in front of the community for a
        vote. You do NOT decide whether it deserves final "Hidden Gem" status — that is a
        separate, later community decision, so do not be reluctant to pass a plausible-but-
        uncertain submission through; the community will make the final call.

        Critical rule: a place NOT being found on Google does NOT mean it is fake. A legitimate
        home-based food business or small local business known only to residents may have zero
        Google presence and still be a perfectly legitimate candidate. Never let a lack of Google
        results by itself drive legitimacy toward zero — evaluate all other available evidence
        (GPS coordinates, address, description, photos, any local/social-media references).

        Assess:
        - google_visibility: how easily this specific place can be found on Google, from the
          "Google Search findings" you're given. VERY_LOW/LOW/MODERATE/HIGH/VERY_HIGH.
        - legitimacy: how much evidence supports that this place genuinely exists as described —
          STRONG/MODERATE/WEAK/INSUFFICIENT. A thin-but-plausible submission is WEAK, not
          INSUFFICIENT; INSUFFICIENT is for submissions with essentially nothing to go on.
        - tourism_value: whether the place offers meaningful value to a visitor or the local
          community (nature, food, culture, a small local business, a local specialty, etc).
          HiddenMY is not restricted to famous attractions — a small home-based business
          qualifies. A famous, mainstream destination should NOT score well here just because
          it happens to be in a less-populated area. Rate its level on the same
          VERY_LOW/LOW/MODERATE/HIGH/VERY_HIGH scale as google_visibility.
        - evidence: quality of the supporting evidence itself (photos, GPS, address specificity,
          description detail) — STRONG/MODERATE/WEAK/INSUFFICIENT.
        - duplicate: your own read on whether this looks like a duplicate of another submission,
          informed by the duplicate-check context you're given (which is authoritative — you're
          only asked to corroborate or note disagreement, not overrule it).
        - in_malaysia: true only if the address/state/coordinates plausibly place this inside
          Malaysia.

        Score each of google_visibility, legitimacy, tourism_value, and evidence from 0-100.
        Never reject or downscore solely because Google can't find the place — hiddenness is
        graded on its own axis, not treated as a red flag.

        Respond only with the requested JSON.
        PROMPT;
    }

    private function scoringResponseSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'overall_score' => ['type' => 'integer'],
                'confidence' => ['type' => 'integer'],
                'in_malaysia' => ['type' => 'boolean'],
                'google_visibility' => [
                    'type' => 'object',
                    'properties' => [
                        'level' => ['type' => 'string', 'enum' => self::VALID_VISIBILITY_LEVELS],
                        'score' => ['type' => 'integer'],
                        'found_on_google' => ['type' => 'boolean'],
                        'reason' => ['type' => 'string'],
                    ],
                    'required' => ['level', 'reason'],
                ],
                'legitimacy' => [
                    'type' => 'object',
                    'properties' => [
                        'score' => ['type' => 'integer'],
                        'level' => ['type' => 'string', 'enum' => self::VALID_QUALITY_LEVELS],
                        'reason' => ['type' => 'string'],
                    ],
                    'required' => ['score', 'level', 'reason'],
                ],
                'tourism_value' => [
                    'type' => 'object',
                    'properties' => [
                        'score' => ['type' => 'integer'],
                        'level' => ['type' => 'string', 'enum' => self::VALID_VISIBILITY_LEVELS],
                        'reason' => ['type' => 'string'],
                    ],
                    'required' => ['score', 'level', 'reason'],
                ],
                'evidence' => [
                    'type' => 'object',
                    'properties' => [
                        'score' => ['type' => 'integer'],
                        'level' => ['type' => 'string', 'enum' => self::VALID_QUALITY_LEVELS],
                        'reason' => ['type' => 'string'],
                    ],
                    'required' => ['score', 'level', 'reason'],
                ],
                'duplicate' => [
                    'type' => 'object',
                    'properties' => [
                        'status' => ['type' => 'string', 'enum' => self::VALID_DUPLICATE_STATUSES],
                    ],
                    'required' => ['status'],
                ],
                'is_hidden_gem' => ['type' => 'boolean'],
                'reason' => ['type' => 'string'],
                'missing_evidence' => ['type' => 'array', 'items' => ['type' => 'string']],
                'recommendation' => ['type' => 'string'],
            ],
            'required' => ['in_malaysia', 'google_visibility', 'legitimacy', 'tourism_value', 'evidence', 'duplicate', 'reason'],
        ];
    }

    private function buildScoringParts(Location $location, ?string $groundingText, array $duplicate): array
    {
        $duplicateNote = match ($duplicate['status']) {
            'POSSIBLE_DUPLICATE' => sprintf(
                "Automated duplicate check: POSSIBLE match against existing submission \"%s\" (name similarity %.0f%%, %.0fm away). Not confirmed — factor this in, but do not treat it as certain.",
                $duplicate['location']?->place_name ?? 'unknown',
                $duplicate['name_similarity'] * 100,
                $duplicate['distance_meters'] ?? 0,
            ),
            default => 'Automated duplicate check: no likely duplicate found.',
        };

        $parts = [
            [
                'text' => sprintf(
                    "Place name: %s\nCategory: %s\nState: %s\nAddress: %s\nDescription: %s\n\n%s\n\nGoogle Search findings:\n%s",
                    $location->place_name,
                    $location->category->name ?? 'Unknown',
                    $location->state,
                    $location->address,
                    Str::limit($location->description, self::DESCRIPTION_LIMIT),
                    $duplicateNote,
                    $groundingText ?? 'Google Search results were unavailable for this submission (a technical/quota issue, not a finding). Assess google_visibility from your own general knowledge instead: if you recognize this as a well-known, mainstream, or widely-documented place (e.g. a famous landmark or major attraction), reflect that honestly with a HIGH or VERY_HIGH rating even without live search. If you do not recognize the name and it plausibly describes a small local place, that is not evidence it is fake — rate it LOW/VERY_LOW rather than guessing high just because search was unavailable.',
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

    // ==================== VALIDATION HELPERS ====================

    private function decodeJson(string $text): ?array
    {
        $decoded = json_decode($text, true);

        if (is_array($decoded)) {
            return $decoded;
        }

        // Gemini occasionally wraps JSON in a markdown fence even with
        // response_mime_type set — strip it and retry once.
        $stripped = trim($text);
        $stripped = preg_replace('/^```(?:json)?/i', '', $stripped) ?? $stripped;
        $stripped = preg_replace('/```$/', '', trim($stripped)) ?? $stripped;
        $decoded = json_decode(trim($stripped), true);

        return is_array($decoded) ? $decoded : null;
    }

    private function validateScoringResponse(?array $parsed): ?array
    {
        if ($parsed === null) {
            return null;
        }

        $requiredGroups = ['google_visibility', 'legitimacy', 'tourism_value', 'evidence', 'duplicate'];
        foreach ($requiredGroups as $group) {
            if (! is_array($parsed[$group] ?? null)) {
                return null;
            }
        }

        if (! array_key_exists('in_malaysia', $parsed) || ! array_key_exists('reason', $parsed)) {
            return null;
        }

        $parsed['in_malaysia'] = (bool) $parsed['in_malaysia'];

        $visibilityLevel = strtoupper((string) ($parsed['google_visibility']['level'] ?? ''));
        if (! in_array($visibilityLevel, self::VALID_VISIBILITY_LEVELS, true)) {
            return null;
        }
        $parsed['google_visibility']['level'] = $visibilityLevel;

        // tourism_value uses the same VERY_LOW..VERY_HIGH scale as
        // google_visibility (a "how much value" read), not the
        // STRONG/MODERATE/WEAK/INSUFFICIENT "how much evidence" scale used by
        // legitimacy/evidence.
        $tourismLevel = strtoupper((string) ($parsed['tourism_value']['level'] ?? ''));
        if (! in_array($tourismLevel, self::VALID_VISIBILITY_LEVELS, true) || ! is_numeric($parsed['tourism_value']['score'] ?? null)) {
            return null;
        }
        $parsed['tourism_value']['level'] = $tourismLevel;

        foreach (['legitimacy', 'evidence'] as $group) {
            $level = strtoupper((string) ($parsed[$group]['level'] ?? ''));
            if (! in_array($level, self::VALID_QUALITY_LEVELS, true) || ! is_numeric($parsed[$group]['score'] ?? null)) {
                return null;
            }
            $parsed[$group]['level'] = $level;
        }

        $duplicateStatus = strtoupper((string) ($parsed['duplicate']['status'] ?? 'NO_DUPLICATE'));
        $parsed['duplicate']['status'] = in_array($duplicateStatus, self::VALID_DUPLICATE_STATUSES, true)
            ? $duplicateStatus
            : 'NO_DUPLICATE';

        return $parsed;
    }

    /**
     * POST to Gemini's generateContent endpoint, trying each configured model
     * in order. Retry / fallback policy by failure class:
     *   - transient (5xx, timeout, connection): up to 2 retries on the primary
     *     model, then a single attempt on the fallback
     *   - bad_response (HTTP 200 but unusable body): 1 retry on the primary,
     *     then the fallback
     *   - rate_limit (429): one Retry-After-aware retry on the primary, then
     *     the fallback
     *   - model_missing (404): straight to the fallback, no retry (and log —
     *     GEMINI_MODEL is probably pointing at a retired model)
     *   - deterministic (400/401/403): abort immediately; a bad request to one
     *     model is a bad request to all of them
     * Worst case is 4 HTTP calls per invocation (3 primary + 1 fallback).
     *
     * @param  callable(string $model): array  $payload    builds the request body for a given model
     * @param  callable(Response): bool|null   $validator  return false to treat a 200 as bad_response
     * @return array{response: Response, model: string}
     */
    private function postToGemini(string $apiKey, callable $payload, int $timeout, ?callable $validator = null): array
    {
        $models = $this->models();
        $lastError = null;

        foreach ($models as $index => $model) {
            $isFallback = $index > 0;

            for ($attempt = 1; ; $attempt++) {
                try {
                    $response = Http::withHeaders(['x-goog-api-key' => $apiKey])
                        ->timeout($timeout)
                        ->post(
                            'https://generativelanguage.googleapis.com/v1beta/models/'.$model.':generateContent',
                            $payload($model),
                        )
                        ->throw();

                    if ($validator !== null && ! $validator($response)) {
                        throw new GeminiBadResponseException(
                            'Gemini returned an unusable response (malformed JSON or content-filtered).'
                        );
                    }

                    return ['response' => $response, 'model' => $model];
                } catch (Throwable $e) {
                    $lastError = $e;
                    $class = $this->classifyGeminiFailure($e);

                    Log::warning('Gemini call failed.', [
                        'location_id' => $this->locationId,
                        'model' => $model,
                        'attempt' => $attempt,
                        'class' => $class,
                        'error' => $e->getMessage(),
                    ]);

                    // A malformed request won't be fixed by retrying or by
                    // switching models — stop the whole pipeline now.
                    if ($class === 'deterministic') {
                        throw $e;
                    }

                    if ($class === 'model_missing') {
                        Log::error('Gemini model unavailable (404) — update GEMINI_MODEL / GEMINI_FALLBACK_MODEL.', [
                            'model' => $model,
                        ]);

                        break; // straight to the next model, no retry
                    }

                    $maxAttempts = match (true) {
                        $isFallback => 1, // fallback model is a single shot
                        $class === 'rate_limit', $class === 'bad_response' => 2,
                        default => 3, // transient on the primary: 2 retries
                    };

                    if ($attempt >= $maxAttempts) {
                        break; // give up on this model, try the next one
                    }

                    $delay = $this->retryDelayMicroseconds($class, $attempt, $e);
                    if ($delay > 0) {
                        usleep($delay);
                    }
                }
            }
        }

        throw $lastError ?? new \RuntimeException('Gemini request failed: no model configured.');
    }

    /** @return 'transient'|'rate_limit'|'model_missing'|'deterministic'|'bad_response' */
    private function classifyGeminiFailure(Throwable $e): string
    {
        if ($e instanceof GeminiBadResponseException) {
            return 'bad_response';
        }

        if ($e instanceof ConnectionException) {
            return 'transient'; // DNS / connect / read timeout
        }

        if ($e instanceof RequestException) {
            $status = $e->response->status();

            return match (true) {
                $status === 429 => 'rate_limit',
                $status === 404 => 'model_missing',
                in_array($status, self::RETRYABLE_HTTP_STATUSES, true) => 'transient',
                $status >= 400 && $status < 500 => 'deterministic',
                default => 'transient',
            };
        }

        return 'transient';
    }

    private function retryDelayMicroseconds(string $class, int $attempt, Throwable $e): int
    {
        if (app()->runningUnitTests()) {
            return 0;
        }

        if ($class === 'rate_limit' && $e instanceof RequestException) {
            $retryAfter = (int) $e->response->header('Retry-After');

            if ($retryAfter > 0) {
                return min($retryAfter, 30) * 1_000_000;
            }
        }

        // Exponential backoff: 1s, 2s, 4s.
        return (2 ** ($attempt - 1)) * 1_000_000;
    }

    /**
     * Ordered list of models to try: [primary] or [primary, fallback]. Both
     * come from config, which carries hard-coded defaults, plus a final
     * literal guard here so a blank config value can never disable verification.
     *
     * @return list<string>
     */
    private function models(): array
    {
        $primary = trim((string) config('services.gemini.model')) ?: self::DEFAULT_MODEL;
        $fallback = trim((string) config('services.gemini.fallback_model'));

        return array_values(array_unique(array_filter([$primary, $fallback])));
    }

    private function clampScore(mixed $value): int
    {
        return max(0, min(100, (int) round((float) $value)));
    }

    /** Cheap defensive backstop alongside Gemini's own in_malaysia judgment — Malaysia's rough bounding box. */
    private function isWithinMalaysiaBoundingBox(float $lat, float $lon): bool
    {
        return $lat >= 0.8 && $lat <= 7.5 && $lon >= 99.0 && $lon <= 119.5;
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
        } catch (Throwable $e) {
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
