<?php

namespace Tests\Feature\HiddenGems;

use App\Jobs\HiddenGems\VerifyHiddenGemSubmission;
use App\Models\Category;
use App\Models\Location;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Model-fallback and failure-classification behaviour of the Stage 1 job.
 * A technical failure must always leave the submission 'pending' — never
 * 'ai_rejected'.
 */
class VerifyHiddenGemModelFallbackTest extends TestCase
{
    use RefreshDatabase;

    private const PRIMARY = 'gemini-3.6-flash';

    private const FALLBACK = 'gemini-flash-lite-latest';

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.gemini.key' => 'fake-key',
            'services.gemini.model' => self::PRIMARY,
            'services.gemini.fallback_model' => self::FALLBACK,
        ]);
    }

    /** A schema-valid Call B body that scores well above the pass threshold. */
    private function callBSuccessBody(): array
    {
        $scoring = [
            'in_malaysia' => true,
            'google_visibility' => ['level' => 'VERY_LOW', 'score' => 95, 'found_on_google' => false, 'reason' => 'No genuine matches.'],
            'legitimacy' => ['score' => 75, 'level' => 'MODERATE', 'reason' => 'GPS, photos and description are consistent.'],
            'tourism_value' => ['score' => 75, 'level' => 'MODERATE', 'reason' => 'Offers a local experience.'],
            'evidence' => ['score' => 70, 'level' => 'MODERATE', 'reason' => 'Multiple supporting pieces of evidence.'],
            'duplicate' => ['status' => 'NO_DUPLICATE'],
            'reason' => 'Plausible local place with very low Google visibility.',
        ];

        return [
            'candidates' => [
                ['content' => ['parts' => [['text' => json_encode($scoring)]]]],
            ],
        ];
    }

    private function callAResearchBody(): array
    {
        return [
            'candidates' => [
                ['content' => ['parts' => [['text' => 'No genuine matches found for this place under any name variation.']]]],
            ],
        ];
    }

    private function runJob(Location $location): Location
    {
        (new VerifyHiddenGemSubmission($location->id))->handle();

        return $location->refresh();
    }

    private function isCallA($request): bool
    {
        return isset($request->data()['tools']);
    }

    public function test_primary_503_then_fallback_succeeds(): void
    {
        $location = Location::factory()->create(['status' => 'pending']);

        Http::fake(function ($request) {
            $isPrimary = str_contains($request->url(), self::PRIMARY);

            if ($isPrimary) {
                return Http::response(['error' => ['message' => 'high demand']], 503);
            }

            return Http::response($this->isCallA($request) ? $this->callAResearchBody() : $this->callBSuccessBody());
        });

        $location = $this->runJob($location);

        $this->assertSame('pending_community_vote', $location->status);
        $this->assertSame(self::FALLBACK, $location->verification_model);
    }

    public function test_primary_404_falls_back_immediately_without_retrying_primary(): void
    {
        $location = Location::factory()->create(['status' => 'pending']);

        $primaryCalls = 0;

        Http::fake(function ($request) use (&$primaryCalls) {
            if (str_contains($request->url(), self::PRIMARY)) {
                $primaryCalls++;

                return Http::response(['error' => ['message' => 'model not found']], 404);
            }

            return Http::response($this->isCallA($request) ? $this->callAResearchBody() : $this->callBSuccessBody());
        });

        $location = $this->runJob($location);

        $this->assertSame('pending_community_vote', $location->status);
        $this->assertSame(self::FALLBACK, $location->verification_model);
        // One attempt for Call A + one for Call B, no retries on a 404.
        $this->assertSame(2, $primaryCalls);
    }

    public function test_both_models_failing_leaves_submission_pending(): void
    {
        $location = Location::factory()->create(['status' => 'pending']);

        Http::fake(fn () => Http::response(['error' => ['message' => 'high demand']], 503));

        $location = $this->runJob($location);

        $this->assertSame('pending', $location->status);
        $this->assertSame(1, $location->verification_attempts);
        $this->assertNull($location->verification_score);
        $this->assertNull($location->verification_model);
    }

    public function test_deterministic_400_does_not_retry_or_fall_back(): void
    {
        $location = Location::factory()->create(['status' => 'pending']);

        $calls = 0;

        Http::fake(function ($request) use (&$calls) {
            $calls++;

            // Call A tolerates failure (continues as "visibility unknown"),
            // so force the 400 on Call B to exercise the terminal path.
            if ($this->isCallA($request)) {
                return Http::response($this->callAResearchBody());
            }

            return Http::response(['error' => ['message' => 'Request payload too large']], 400);
        });

        $location = $this->runJob($location);

        $this->assertSame('pending', $location->status);
        // 1 Call A + exactly 1 Call B (no retry, no fallback on a 400).
        $this->assertSame(2, $calls);
    }

    public function test_safety_blocked_response_leaves_submission_pending(): void
    {
        $location = Location::factory()->create(['status' => 'pending']);

        Http::fake(function ($request) {
            if ($this->isCallA($request)) {
                return Http::response($this->callAResearchBody());
            }

            // 200, but content-filtered: a candidate with no text parts.
            return Http::response([
                'candidates' => [
                    ['finishReason' => 'SAFETY', 'content' => ['parts' => []]],
                ],
            ]);
        });

        $location = $this->runJob($location);

        $this->assertSame('pending', $location->status);
    }

    public function test_no_fallback_configured_uses_only_the_primary(): void
    {
        config(['services.gemini.fallback_model' => '']);

        $location = Location::factory()->create(['status' => 'pending']);

        $fallbackCalls = 0;

        Http::fake(function ($request) use (&$fallbackCalls) {
            if (str_contains($request->url(), self::FALLBACK)) {
                $fallbackCalls++;
            }

            return Http::response(['error' => ['message' => 'high demand']], 503);
        });

        $location = $this->runJob($location);

        $this->assertSame('pending', $location->status);
        $this->assertSame(0, $fallbackCalls);
    }

    public function test_happy_path_records_the_primary_model(): void
    {
        $location = Location::factory()->create(['status' => 'pending']);

        Http::fake(fn ($request) => Http::response(
            $this->isCallA($request) ? $this->callAResearchBody() : $this->callBSuccessBody()
        ));

        $location = $this->runJob($location);

        $this->assertSame('pending_community_vote', $location->status);
        $this->assertSame(self::PRIMARY, $location->verification_model);
    }

    public function test_submission_queues_the_job_and_does_not_call_gemini_in_the_request(): void
    {
        Bus::fake([VerifyHiddenGemSubmission::class]);
        Http::fake();

        $user = User::factory()->create();
        $category = Category::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/hidden-gems', [
            'category_id' => $category->id,
            'place_name' => 'Warung Tepi Sawah',
            'address' => '12 Jalan Kampung',
            'state' => 'Perak',
            'postcode' => '31000',
            'description' => 'A tiny rice-field-side warung known only to locals.',
            'latitude' => 4.59,
            'longitude' => 101.09,
        ])->assertCreated();

        Bus::assertDispatched(VerifyHiddenGemSubmission::class);
        // Gemini is only contacted when the job runs on the queue worker,
        // never inside the user's submission request.
        Http::assertNothingSent();
    }
}
