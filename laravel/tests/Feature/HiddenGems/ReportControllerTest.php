<?php

namespace Tests\Feature\HiddenGems;

use App\Models\CheckIn;
use App\Models\Location;
use App\Models\Report;
use App\Models\ReportVote;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReportControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_one_traveller_cannot_vote_twice_for_the_same_report(): void
    {
        [$report, $voter] = $this->reportWithEligibleVoter();

        $this->actingAs($voter)->postJson("/api/reports/{$report->id}/verify", [
            'verdict' => 'confirm',
        ])->assertCreated();

        $this->actingAs($voter)->postJson("/api/reports/{$report->id}/verify", [
            'verdict' => 'confirm',
        ])->assertStatus(400)->assertJson([
            'message' => 'You have already voted on this report.',
        ]);

        $this->assertDatabaseCount('report_votes', 1);
    }

    public function test_vote_totals_are_recalculated_from_stored_vote_rows(): void
    {
        [$report, $voter] = $this->reportWithEligibleVoter([
            'confirm_count' => 99,
            'dispute_count' => 88,
        ]);
        ReportVote::create([
            'report_id' => $report->id,
            'user_id' => User::factory()->create()->id,
            'verdict' => 'confirm',
        ]);

        $this->actingAs($voter)->postJson("/api/reports/{$report->id}/verify", [
            'verdict' => 'dispute',
        ])->assertCreated();

        $report->refresh();
        $this->assertSame(1, $report->confirm_count);
        $this->assertSame(1, $report->dispute_count);
        $this->assertSame(Report::STATUS_PENDING, $report->status);
    }

    public function test_confirm_threshold_resolves_once_and_late_vote_is_rejected(): void
    {
        [$report, $voter] = $this->reportWithEligibleVoter();
        $this->seedReportVotes($report, 'confirm', 4);

        $this->actingAs($voter)->postJson("/api/reports/{$report->id}/verify", [
            'verdict' => 'confirm',
        ])->assertCreated()->assertJsonPath('report.status', Report::STATUS_UPHELD);

        $resolvedAt = $report->fresh()->resolved_at;
        $lateVoter = User::factory()->create();
        $this->checkIn($lateVoter, $report->location);

        $this->actingAs($lateVoter)->postJson("/api/reports/{$report->id}/verify", [
            'verdict' => 'confirm',
        ])->assertStatus(400)->assertJson([
            'message' => 'This report has already been resolved.',
        ]);

        $this->assertSame(5, $report->votes()->count());
        $this->assertTrue($resolvedAt->equalTo($report->fresh()->resolved_at));
        $this->assertNotNull($report->location->fresh()->permanently_closed_at);
    }

    public function test_dispute_threshold_rejects_report_without_closing_location(): void
    {
        [$report, $voter] = $this->reportWithEligibleVoter();
        $this->seedReportVotes($report, 'dispute', 4);

        $this->actingAs($voter)->postJson("/api/reports/{$report->id}/verify", [
            'verdict' => 'dispute',
        ])->assertCreated()->assertJsonPath('report.status', Report::STATUS_REJECTED);

        $this->assertSame(5, $report->fresh()->dispute_count);
        $this->assertNull($report->location->fresh()->permanently_closed_at);
    }

    public function test_two_active_reports_are_returned_separately_with_the_legacy_field(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $location = Location::factory()->create([
            'user_id' => $owner->id,
            'status' => 'hidden_gem',
            'report_status' => 'under_review',
        ]);
        $closed = $this->createReport($location, Report::REASON_PERMANENTLY_CLOSED);
        $contact = $this->createReport($location, Report::REASON_INCORRECT_CONTACT);
        $this->checkIn($viewer, $location);
        $this->seedReportVotes($closed, 'confirm', 2);
        $this->seedReportVotes($contact, 'dispute', 3);
        $closed->update(['confirm_count' => 2]);
        $contact->update(['dispute_count' => 3]);

        $response = $this->actingAs($viewer)
            ->getJson("/api/reports/location/{$location->id}")
            ->assertOk()
            ->assertJsonCount(2, 'active_reports')
            ->assertJsonPath('active_reports.0.can_verify', true)
            ->assertJsonPath('active_reports.1.can_verify', true);

        $reports = collect($response->json('active_reports'))->keyBy('reason');
        $this->assertSame(2, $reports[Report::REASON_PERMANENTLY_CLOSED]['confirm_count']);
        $this->assertSame(0, $reports[Report::REASON_PERMANENTLY_CLOSED]['dispute_count']);
        $this->assertSame(0, $reports[Report::REASON_INCORRECT_CONTACT]['confirm_count']);
        $this->assertSame(3, $reports[Report::REASON_INCORRECT_CONTACT]['dispute_count']);
        $this->assertSame($response->json('active_reports.0.id'), $response->json('data.id'));
        $this->assertSame($response->json('data.id'), $response->json('root_report.id'));
    }

    public function test_owner_sees_every_active_reason_without_identity_or_verify_action(): void
    {
        $owner = User::factory()->create();
        $location = Location::factory()->create([
            'user_id' => $owner->id,
            'status' => 'hidden_gem',
            'report_status' => 'under_review',
        ]);
        $this->createReport($location, Report::REASON_PERMANENTLY_CLOSED);
        $this->createReport($location, Report::REASON_INCORRECT_CONTACT);

        $response = $this->actingAs($owner)
            ->getJson("/api/reports/location/{$location->id}")
            ->assertOk()
            ->assertJsonCount(2, 'active_reports');

        $this->assertEqualsCanonicalizing(
            Report::REASONS,
            collect($response->json('active_reports'))->pluck('reason')->all(),
        );

        foreach ($response->json('active_reports') as $report) {
            $this->assertFalse($report['can_verify']);
            $this->assertArrayNotHasKey('user_id', $report);
            $this->assertArrayNotHasKey('user', $report);
            $this->assertArrayNotHasKey('votes', $report);
        }
    }

    public function test_owner_and_reporter_remain_blocked_from_verifying(): void
    {
        $owner = User::factory()->create();
        $reporter = User::factory()->create();
        $location = Location::factory()->create(['user_id' => $owner->id, 'status' => 'hidden_gem']);
        $report = $this->createReport($location, Report::REASON_PERMANENTLY_CLOSED, $reporter);
        $this->checkIn($owner, $location);
        $this->checkIn($reporter, $location);

        $this->actingAs($owner)->postJson("/api/reports/{$report->id}/verify", [
            'verdict' => 'confirm',
        ])->assertStatus(403);

        $this->actingAs($reporter)->postJson("/api/reports/{$report->id}/verify", [
            'verdict' => 'confirm',
        ])->assertStatus(403);

        $this->assertDatabaseCount('report_votes', 0);
    }

    public function test_my_hidden_gems_returns_only_a_boolean_pending_report_indicator(): void
    {
        $owner = User::factory()->create();
        $pending = Location::factory()->create(['user_id' => $owner->id, 'status' => 'hidden_gem']);
        $multiplePending = Location::factory()->create(['user_id' => $owner->id, 'status' => 'hidden_gem']);
        $withoutReports = Location::factory()->create(['user_id' => $owner->id, 'status' => 'hidden_gem']);
        $upheldOnly = Location::factory()->create(['user_id' => $owner->id, 'status' => 'hidden_gem']);
        $rejectedOnly = Location::factory()->create(['user_id' => $owner->id, 'status' => 'hidden_gem']);

        $this->createReport($pending, Report::REASON_PERMANENTLY_CLOSED, null, [
            'description' => 'Owner-visible only on detail.',
        ]);
        $this->createReport($multiplePending, Report::REASON_PERMANENTLY_CLOSED);
        $this->createReport($multiplePending, Report::REASON_INCORRECT_CONTACT);
        $this->createReport($upheldOnly, Report::REASON_PERMANENTLY_CLOSED, null, [
            'status' => Report::STATUS_UPHELD,
        ]);
        $this->createReport($rejectedOnly, Report::REASON_INCORRECT_CONTACT, null, [
            'status' => Report::STATUS_REJECTED,
        ]);

        $response = $this->actingAs($owner)->getJson('/api/my-hidden-gems')->assertOk();
        $locations = collect($response->json('data'))->keyBy('id');

        $this->assertTrue($locations[$pending->id]['has_active_report']);
        $this->assertTrue($locations[$multiplePending->id]['has_active_report']);
        $this->assertFalse($locations[$withoutReports->id]['has_active_report']);
        $this->assertFalse($locations[$upheldOnly->id]['has_active_report']);
        $this->assertFalse($locations[$rejectedOnly->id]['has_active_report']);

        foreach ($locations as $location) {
            $this->assertIsBool($location['has_active_report']);
            $this->assertArrayNotHasKey('reports', $location);
            $this->assertArrayNotHasKey('active_reports', $location);
        }

        $payload = $response->getContent();
        $this->assertStringNotContainsString('Owner-visible only on detail.', $payload);
        $this->assertStringNotContainsString('report_votes', $payload);
    }

    public function test_authenticated_viewers_receive_details_with_backend_controlled_actions(): void
    {
        $owner = User::factory()->create();
        $reporter = User::factory()->create();
        $eligibleViewer = User::factory()->create();
        $previousVoter = User::factory()->create();
        $location = Location::factory()->create([
            'user_id' => $owner->id,
            'status' => 'hidden_gem',
            'report_status' => 'under_review',
        ]);
        $report = $this->createReport(
            $location,
            Report::REASON_INCORRECT_CONTACT,
            $reporter,
            ['description' => 'The listed phone number is disconnected.'],
        );
        ReportVote::create([
            'report_id' => $report->id,
            'user_id' => $previousVoter->id,
            'verdict' => 'confirm',
        ]);

        $this->getJson("/api/reports/location/{$location->id}")->assertUnauthorized();

        foreach ([$owner, $reporter, $previousVoter] as $viewer) {
            $this->actingAs($viewer)
                ->getJson("/api/reports/location/{$location->id}")
                ->assertOk()
                ->assertJsonPath('active_reports.0.description', 'The listed phone number is disconnected.')
                ->assertJsonPath('active_reports.0.can_verify', false)
                ->assertJsonMissingPath('active_reports.0.user_id')
                ->assertJsonMissingPath('active_reports.0.user')
                ->assertJsonMissingPath('active_reports.0.votes');
        }

        $this->actingAs($eligibleViewer)
            ->getJson("/api/reports/location/{$location->id}")
            ->assertOk()
            ->assertJsonPath('active_reports.0.description', 'The listed phone number is disconnected.')
            ->assertJsonPath('active_reports.0.can_verify', true);
    }

    public function test_public_detail_exposes_only_pending_report_existence(): void
    {
        $owner = User::factory()->create();
        $onePending = Location::factory()->create(['user_id' => $owner->id, 'status' => 'hidden_gem']);
        $multiplePending = Location::factory()->create(['user_id' => $owner->id, 'status' => 'hidden_gem']);
        $withoutPending = Location::factory()->create(['user_id' => $owner->id, 'status' => 'hidden_gem']);
        $upheldOnly = Location::factory()->create(['user_id' => $owner->id, 'status' => 'hidden_gem']);

        $this->createReport($onePending, Report::REASON_PERMANENTLY_CLOSED, null, [
            'description' => 'Private closure explanation.',
            'confirm_count' => 3,
        ]);
        $this->createReport($multiplePending, Report::REASON_PERMANENTLY_CLOSED);
        $this->createReport($multiplePending, Report::REASON_INCORRECT_CONTACT);
        $this->createReport($upheldOnly, Report::REASON_PERMANENTLY_CLOSED, null, [
            'status' => Report::STATUS_UPHELD,
        ]);

        $this->getJson("/api/hidden-gems/{$onePending->id}")
            ->assertOk()
            ->assertJsonPath('data.has_active_report', true);
        $this->getJson("/api/hidden-gems/{$multiplePending->id}")
            ->assertOk()
            ->assertJsonPath('data.has_active_report', true);
        $this->getJson("/api/hidden-gems/{$withoutPending->id}")
            ->assertOk()
            ->assertJsonPath('data.has_active_report', false);
        $this->getJson("/api/hidden-gems/{$upheldOnly->id}")
            ->assertOk()
            ->assertJsonPath('data.has_active_report', false);

        $payload = $this->getJson("/api/hidden-gems/{$onePending->id}")->assertOk();
        $payload->assertJsonMissingPath('data.reports')
            ->assertJsonMissingPath('data.active_reports')
            ->assertJsonMissingPath('data.reason')
            ->assertJsonMissingPath('data.reason_label')
            ->assertJsonMissingPath('data.photo_path')
            ->assertJsonMissingPath('data.confirm_count')
            ->assertJsonMissingPath('data.dispute_count')
            ->assertJsonMissingPath('data.my_verdict');
        $this->assertStringNotContainsString('Private closure explanation.', $payload->getContent());
    }

    public function test_verification_ignores_legacy_comment_and_preserves_report_description(): void
    {
        [$report, $voter] = $this->reportWithEligibleVoter([
            'description' => 'Original reporter explanation.',
        ]);

        $this->actingAs($voter)->postJson("/api/reports/{$report->id}/verify", [
            'verdict' => 'confirm',
            'comment' => 'Legacy verifier comment must be ignored.',
        ])->assertCreated();

        $vote = ReportVote::where('report_id', $report->id)
            ->where('user_id', $voter->id)
            ->firstOrFail();
        $this->assertNull($vote->getRawOriginal('comment'));
        $this->assertSame('Original reporter explanation.', $report->fresh()->description);
    }

    private function reportWithEligibleVoter(array $attributes = []): array
    {
        $owner = User::factory()->create();
        $voter = User::factory()->create();
        $location = Location::factory()->create([
            'user_id' => $owner->id,
            'status' => 'hidden_gem',
            'report_status' => 'under_review',
        ]);
        $report = $this->createReport($location, Report::REASON_PERMANENTLY_CLOSED, null, $attributes);
        $this->checkIn($voter, $location);

        return [$report, $voter];
    }

    private function createReport(
        Location $location,
        string $reason,
        ?User $reporter = null,
        array $attributes = [],
    ): Report {
        return Report::create(array_merge([
            'user_id' => ($reporter ?? User::factory()->create())->id,
            'location_id' => $location->id,
            'reason' => $reason,
            'status' => Report::STATUS_PENDING,
            'confirm_count' => 0,
            'dispute_count' => 0,
        ], $attributes));
    }

    private function seedReportVotes(Report $report, string $verdict, int $count): void
    {
        User::factory()->count($count)->create()->each(function (User $user) use ($report, $verdict) {
            ReportVote::create([
                'report_id' => $report->id,
                'user_id' => $user->id,
                'verdict' => $verdict,
            ]);
        });
    }

    private function checkIn(User $user, Location $location): void
    {
        CheckIn::create([
            'user_id' => $user->id,
            'location_id' => $location->id,
            'check_in_at' => now(),
        ]);
    }
}
