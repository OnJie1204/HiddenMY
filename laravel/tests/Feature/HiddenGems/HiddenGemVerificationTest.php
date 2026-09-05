<?php

namespace Tests\Feature\HiddenGems;

use App\Jobs\HiddenGems\VerifyHiddenGemSubmission;
use App\Models\Location;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class HiddenGemVerificationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.gemini.key' => 'fake-key',
            'services.gemini.model' => 'gemini-3.6-flash',
            'services.gemini.fallback_model' => 'gemini-flash-lite-latest',
        ]);
    }

    private function fakeGemini(?string $groundingText, ?array $scoringJson): void
    {
        $callA = [
            'candidates' => [
                ['content' => ['parts' => [['text' => $groundingText ?? '']]]],
            ],
        ];

        $callB = [
            'candidates' => [
                ['content' => ['parts' => [['text' => json_encode($scoringJson)]]]],
            ],
        ];

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::sequence()->push($callA)->push($callB),
        ]);
    }

    private function scoring(array $overrides = []): array
    {
        return array_replace_recursive([
            'overall_score' => 80,
            'confidence' => 80,
            'in_malaysia' => true,
            'google_visibility' => [
                'level' => 'VERY_LOW',
                'score' => 95,
                'found_on_google' => false,
                'reason' => 'No meaningful matching Google result was identified.',
            ],
            'legitimacy' => [
                'score' => 70,
                'level' => 'MODERATE',
                'reason' => 'GPS, photos and description are consistent.',
            ],
            'tourism_value' => [
                'score' => 70,
                'level' => 'MODERATE',
                'reason' => 'Offers a local experience.',
            ],
            'evidence' => [
                'score' => 70,
                'level' => 'MODERATE',
                'reason' => 'Multiple supporting pieces of evidence were provided.',
            ],
            'duplicate' => ['status' => 'NO_DUPLICATE'],
            'is_hidden_gem' => true,
            'reason' => 'Plausible local place with limited Google visibility.',
            'missing_evidence' => [],
            'recommendation' => 'PROCEED',
        ], $overrides);
    }

    private function runJob(Location $location): Location
    {
        (new VerifyHiddenGemSubmission($location->id))->handle();

        return $location->refresh();
    }

    public function test_famous_attraction_is_ai_rejected(): void
    {
        $location = Location::factory()->create([
            'place_name' => 'Petronas Twin Towers',
            'status' => 'pending',
        ]);

        $this->fakeGemini(
            'Petronas Twin Towers is one of the most documented landmarks in Malaysia, with an official website, thousands of reviews, and a full Google Maps listing.',
            $this->scoring([
                'google_visibility' => ['level' => 'VERY_HIGH', 'score' => 0, 'found_on_google' => true, 'reason' => 'Mainstream, heavily documented landmark.'],
                'legitimacy' => ['score' => 95, 'level' => 'STRONG'],
                'tourism_value' => ['score' => 90, 'level' => 'HIGH'],
                'evidence' => ['score' => 90, 'level' => 'STRONG'],
                'is_hidden_gem' => false,
            ])
        );

        $location = $this->runJob($location);

        $this->assertSame('ai_rejected', $location->status);
        $this->assertSame('VERY_HIGH', $location->google_visibility_level);
        $this->assertLessThan(60, $location->verification_score);
    }

    public function test_famous_attraction_is_still_rejected_when_grounding_fails(): void
    {
        // Regression test: when live Search grounding fails, Call B is still
        // asked for its own best-effort visibility read from general
        // knowledge, and that read must actually be used — not discarded in
        // favor of a blind neutral default that could let a famous landmark's
        // high legitimacy/evidence scores carry it past the pass threshold.
        $location = Location::factory()->create([
            'place_name' => 'Petronas Twin Towers',
            'status' => 'pending',
        ]);

        // Call A (has a `tools` key) fails on every model and every attempt;
        // Call B (has `generationConfig`) succeeds. Keyed on request shape so
        // the test doesn't depend on the exact retry/fallback attempt counts.
        Http::fake(function ($request) {
            if (isset($request->data()['tools'])) {
                return Http::response(['error' => ['message' => 'unavailable']], 503);
            }

            return Http::response([
                'candidates' => [
                    ['content' => ['parts' => [['text' => json_encode($this->scoring([
                        'google_visibility' => ['level' => 'VERY_HIGH', 'score' => 0, 'found_on_google' => true, 'reason' => 'Recognized from general knowledge as a globally famous landmark.'],
                        'legitimacy' => ['score' => 100, 'level' => 'STRONG'],
                        'tourism_value' => ['score' => 10, 'level' => 'LOW'],
                        'evidence' => ['score' => 90, 'level' => 'STRONG'],
                        'is_hidden_gem' => false,
                    ]))]]]],
                ],
            ]);
        });

        $location = $this->runJob($location);

        $this->assertSame('ai_rejected', $location->status);
        $this->assertSame('VERY_HIGH', $location->google_visibility_level);
    }

    public function test_local_home_based_store_is_not_auto_rejected(): void
    {
        $location = Location::factory()->create([
            'place_name' => 'Mak Cik Aminah Homemade Kuih',
            'status' => 'pending',
        ]);

        $this->fakeGemini(
            'No meaningful results were found for this business under any name variation searched.',
            $this->scoring([
                'google_visibility' => ['level' => 'VERY_LOW', 'score' => 95, 'found_on_google' => false],
                'legitimacy' => ['score' => 65, 'level' => 'MODERATE'],
                'tourism_value' => ['score' => 70, 'level' => 'MODERATE'],
                'evidence' => ['score' => 70, 'level' => 'MODERATE'],
            ])
        );

        $location = $this->runJob($location);

        $this->assertNotSame('ai_rejected', $location->status);
        $this->assertSame('pending_community_vote', $location->status);
    }

    public function test_local_waterfall_is_not_auto_rejected(): void
    {
        $location = Location::factory()->create([
            'place_name' => 'Air Terjun Kampung Sunyi',
            'status' => 'pending',
        ]);

        $this->fakeGemini(
            'No meaningful results were found for this waterfall under any name variation searched.',
            $this->scoring([
                'google_visibility' => ['level' => 'VERY_LOW', 'score' => 95, 'found_on_google' => false],
                'legitimacy' => ['score' => 60, 'level' => 'MODERATE'],
                'tourism_value' => ['score' => 75, 'level' => 'HIGH'],
                'evidence' => ['score' => 65, 'level' => 'MODERATE'],
            ])
        );

        $location = $this->runJob($location);

        $this->assertNotSame('ai_rejected', $location->status);
        $this->assertSame('pending_community_vote', $location->status);
    }

    public function test_fabricated_place_with_no_evidence_is_not_wrongly_verified(): void
    {
        $location = Location::factory()->create([
            'place_name' => 'Magic Crystal Waterfall',
            'description' => 'nice place',
            'status' => 'pending',
        ]);

        $this->fakeGemini(
            'No results were found for this place under any name variation searched.',
            $this->scoring([
                'google_visibility' => ['level' => 'VERY_LOW', 'score' => 95, 'found_on_google' => false],
                'legitimacy' => ['score' => 10, 'level' => 'INSUFFICIENT'],
                'tourism_value' => ['score' => 20, 'level' => 'LOW'],
                'evidence' => ['score' => 5, 'level' => 'INSUFFICIENT'],
                'is_hidden_gem' => false,
                'missing_evidence' => ['photos', 'specific address', 'detailed description'],
            ])
        );

        $location = $this->runJob($location);

        $this->assertNotSame('pending_community_vote', $location->status);
    }

    public function test_duplicate_under_different_name_is_confirmed_duplicate_and_rejected_without_calling_gemini(): void
    {
        $existing = Location::factory()->create([
            'place_name' => 'Kampung Sunyi Waterfall',
            'state' => 'Pahang',
            'status' => 'hidden_gem',
            'latitude' => 3.5000,
            'longitude' => 102.5000,
        ]);

        $duplicate = Location::factory()->create([
            'place_name' => 'Kampung Sunyi Waterfal', // slightly different spelling
            'state' => 'Pahang',
            'status' => 'pending',
            'latitude' => 3.5001,
            'longitude' => 102.5001,
        ]);

        Http::fake();

        $duplicate = $this->runJob($duplicate);

        $this->assertSame('ai_rejected', $duplicate->status);
        $this->assertSame('CONFIRMED_DUPLICATE', $duplicate->duplicate_status);
        $this->assertSame($existing->id, $duplicate->duplicate_of_location_id);
        Http::assertNothingSent();
    }

    public function test_legitimate_place_under_alternate_local_name_is_not_treated_as_nonexistent(): void
    {
        $location = Location::factory()->create([
            'place_name' => 'Warung Mak Long',
            'description' => 'Also known locally as "Kedai Makan Mak Long" among residents.',
            'status' => 'pending',
        ]);

        $this->fakeGemini(
            'The exact name returned no results, but searching the alternate local name "Kedai Makan Mak Long" + state surfaced a small number of social media mentions confirming this is a real, currently-operating stall.',
            $this->scoring([
                'google_visibility' => ['level' => 'LOW', 'score' => 80, 'found_on_google' => true, 'reason' => 'Found only under its local alternate name.'],
                'legitimacy' => ['score' => 85, 'level' => 'STRONG'],
                'tourism_value' => ['score' => 75, 'level' => 'HIGH'],
                'evidence' => ['score' => 70, 'level' => 'MODERATE'],
            ])
        );

        $location = $this->runJob($location);

        $this->assertNotSame('ai_rejected', $location->status);
        $this->assertSame('LOW', $location->google_visibility_level);
    }

    public function test_gemini_api_failure_results_in_pending_not_rejected(): void
    {
        $location = Location::factory()->create(['status' => 'pending']);

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response('Service Unavailable', 500),
        ]);

        $location = $this->runJob($location);

        $this->assertSame('pending', $location->status);
        $this->assertStringNotContainsString('500', (string) $location->ai_review_reason);
    }

    public function test_malformed_json_response_falls_back_to_pending(): void
    {
        $location = Location::factory()->create(['status' => 'pending']);

        // Call A returns usable research text; Call B returns 200 but an
        // unparseable body on every model/attempt.
        Http::fake(function ($request) {
            if (isset($request->data()['tools'])) {
                return Http::response([
                    'candidates' => [['content' => ['parts' => [['text' => 'Some research text.']]]]],
                ]);
            }

            return Http::response([
                'candidates' => [['content' => ['parts' => [['text' => 'not valid json at all {{{']]]]],
            ]);
        });

        $location = $this->runJob($location);

        $this->assertSame('pending', $location->status);
    }

    public function test_missing_api_key_leaves_submission_pending(): void
    {
        config(['services.gemini.key' => null]);

        $location = Location::factory()->create(['status' => 'pending']);

        Http::fake();

        $location = $this->runJob($location);

        $this->assertSame('pending', $location->status);
        Http::assertNothingSent();
    }

    public function test_already_processed_submission_is_not_overwritten(): void
    {
        $location = Location::factory()->create(['status' => 'hidden_gem']);

        Http::fake();

        $location = $this->runJob($location);

        $this->assertSame('hidden_gem', $location->status);
        Http::assertNothingSent();
    }
}
