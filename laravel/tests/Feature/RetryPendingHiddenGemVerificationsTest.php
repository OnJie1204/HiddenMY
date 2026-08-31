<?php

namespace Tests\Feature;

use App\Jobs\VerifyHiddenGemSubmission;
use App\Models\Location;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class RetryPendingHiddenGemVerificationsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.gemini.key' => 'fake-key']);
    }

    public function test_stale_pending_submission_under_the_cap_is_retried(): void
    {
        $location = Location::factory()->create([
            'status' => 'pending',
            'verification_attempts' => 1,
            'ai_review_reason' => 'Automated verification could not be completed and will be retried.',
            'updated_at' => now()->subMinutes(10),
        ]);

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response('Service Unavailable', 503),
        ]);

        $this->artisan('hidden-gems:retry-verification')->assertExitCode(0);

        // Per Gemini call, a persistent 503 exhausts the primary model
        // (3 attempts) then the fallback model (1 attempt) = 4; the grounding
        // call and the scoring call each pay that, so 8 in total.
        Http::assertSentCount(8);

        $location->refresh();
        $this->assertSame('pending', $location->status);
        $this->assertSame(2, $location->verification_attempts);
    }

    public function test_recently_updated_pending_submission_is_left_alone(): void
    {
        Location::factory()->create([
            'status' => 'pending',
            'verification_attempts' => 1,
            'updated_at' => now(),
        ]);

        Http::fake();

        $this->artisan('hidden-gems:retry-verification')->assertExitCode(0);

        Http::assertNothingSent();
    }

    public function test_submission_at_the_attempt_cap_is_not_retried(): void
    {
        $location = Location::factory()->create([
            'status' => 'pending',
            'verification_attempts' => VerifyHiddenGemSubmission::MAX_VERIFICATION_ATTEMPTS,
            'updated_at' => now()->subMinutes(10),
        ]);

        Http::fake();

        $this->artisan('hidden-gems:retry-verification')->assertExitCode(0);

        Http::assertNothingSent();

        $location->refresh();
        $this->assertSame(VerifyHiddenGemSubmission::MAX_VERIFICATION_ATTEMPTS, $location->verification_attempts);
    }

    public function test_non_pending_statuses_are_ignored(): void
    {
        Location::factory()->create([
            'status' => 'ai_rejected',
            'updated_at' => now()->subMinutes(10),
        ]);
        Location::factory()->create([
            'status' => 'pending_community_vote',
            'updated_at' => now()->subMinutes(10),
        ]);
        Location::factory()->create([
            'status' => 'hidden_gem',
            'updated_at' => now()->subMinutes(10),
        ]);

        Http::fake();

        $this->artisan('hidden-gems:retry-verification')->assertExitCode(0);

        Http::assertNothingSent();
    }

    public function test_successful_retry_resets_the_attempt_counter(): void
    {
        $location = Location::factory()->create([
            'status' => 'pending',
            'verification_attempts' => 3,
            'updated_at' => now()->subMinutes(10),
        ]);

        $callA = [
            'candidates' => [['content' => ['parts' => [['text' => 'A quiet local spot with no notable online presence.']]]]],
        ];

        $callB = [
            'candidates' => [['content' => ['parts' => [['text' => json_encode([
                'overall_score' => 80,
                'confidence' => 80,
                'in_malaysia' => true,
                'google_visibility' => ['level' => 'VERY_LOW', 'score' => 95, 'found_on_google' => false, 'reason' => 'No meaningful matching Google result.'],
                'legitimacy' => ['score' => 70, 'level' => 'MODERATE', 'reason' => 'Consistent evidence.'],
                'tourism_value' => ['score' => 70, 'level' => 'MODERATE', 'reason' => 'Local experience.'],
                'evidence' => ['score' => 70, 'level' => 'MODERATE', 'reason' => 'Multiple supporting pieces of evidence.'],
                'duplicate' => ['status' => 'NO_DUPLICATE'],
                'is_hidden_gem' => true,
                'reason' => 'Plausible local place with limited Google visibility.',
                'missing_evidence' => [],
                'recommendation' => 'PROCEED',
            ])]]]]],
        ];

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::sequence()->push($callA)->push($callB),
        ]);

        $this->artisan('hidden-gems:retry-verification')->assertExitCode(0);

        $location->refresh();
        $this->assertSame('pending_community_vote', $location->status);
        $this->assertSame(0, $location->verification_attempts);
    }
}
