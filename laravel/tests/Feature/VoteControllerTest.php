<?php

namespace Tests\Feature;

use App\Models\CheckIn;
use App\Models\Location;
use App\Models\User;
use App\Models\Vote;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class VoteControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_voting_is_blocked_while_awaiting_ai_verification(): void
    {
        $owner = User::factory()->create();
        $voter = User::factory()->create();
        $location = Location::factory()->create(['user_id' => $owner->id, 'status' => 'pending']);

        $response = $this->actingAs($voter)->getJson("/api/votes/check/{$location->id}");

        $response->assertOk();
        $response->assertJson(['eligible' => false]);
    }

    public function test_voting_is_blocked_when_ai_rejected(): void
    {
        $owner = User::factory()->create();
        $voter = User::factory()->create();
        $location = Location::factory()->create(['user_id' => $owner->id, 'status' => 'ai_rejected']);

        $response = $this->actingAs($voter)->postJson("/api/votes/{$location->id}", []);

        $response->assertStatus(400);
    }

    public function test_voting_is_allowed_once_pending_community_vote_and_checked_in(): void
    {
        $owner = User::factory()->create();
        $voter = User::factory()->create();
        $location = Location::factory()->create([
            'user_id' => $owner->id,
            'status' => 'pending_community_vote',
            'vote_count' => 0,
            'verification_threshold' => 10,
        ]);

        CheckIn::create([
            'user_id' => $voter->id,
            'location_id' => $location->id,
            'check_in_at' => now(),
        ]);

        $response = $this->actingAs($voter)->postJson("/api/votes/{$location->id}", [
            'comment' => 'Lovely hidden spot!',
        ]);

        $response->assertStatus(201);
        $this->assertSame(1, $location->fresh()->vote_count);
        $this->assertSame('pending_community_vote', $location->fresh()->status);
    }

    public function test_reaching_vote_threshold_promotes_to_hidden_gem(): void
    {
        $owner = User::factory()->create();
        $location = Location::factory()->create([
            'user_id' => $owner->id,
            'status' => 'pending_community_vote',
            'vote_count' => 9,
            'verification_threshold' => 10,
        ]);

        $voter = User::factory()->create();
        CheckIn::create([
            'user_id' => $voter->id,
            'location_id' => $location->id,
            'check_in_at' => now(),
        ]);

        $response = $this->actingAs($voter)->postJson("/api/votes/{$location->id}", []);

        $response->assertStatus(201);
        $this->assertSame('hidden_gem', $location->fresh()->status);
    }

    public function test_cannot_vote_on_already_hidden_gem(): void
    {
        $owner = User::factory()->create();
        $voter = User::factory()->create();
        $location = Location::factory()->create(['user_id' => $owner->id, 'status' => 'hidden_gem']);

        $response = $this->actingAs($voter)->postJson("/api/votes/{$location->id}", []);

        $response->assertStatus(400);
    }

    public function test_vote_owner_can_edit_comment_before_72_hours(): void
    {
        [$owner, , $vote] = $this->createVoteAt(now()->subHours(71));

        $this->actingAs($owner)->patchJson("/api/votes/{$vote->id}/comment", [
            'comment' => 'Updated description',
        ])->assertOk();

        $this->assertSame('Updated description', $vote->fresh()->travel_description);
    }

    public function test_vote_owner_can_edit_exactly_at_72_hour_boundary(): void
    {
        $createdAt = Carbon::parse('2026-01-01 00:00:00');
        [$owner, , $vote] = $this->createVoteAt($createdAt);
        Carbon::setTestNow($createdAt->copy()->addHours(72));

        $this->actingAs($owner)->patchJson("/api/votes/{$vote->id}/comment", [
            'comment' => 'Boundary update',
        ])->assertOk();
    }

    public function test_expired_vote_edit_is_rejected_and_original_content_is_unchanged(): void
    {
        [$owner, , $vote] = $this->createVoteAt(now()->subHours(72)->subSecond());

        $this->actingAs($owner)->patchJson("/api/votes/{$vote->id}/comment", [
            'comment' => 'Should not persist',
        ])->assertForbidden()
            ->assertJsonPath('message', 'Comments can only be edited within 72 hours of posting.');

        $this->assertSame('Original description', $vote->fresh()->travel_description);
    }

    public function test_non_owner_cannot_edit_vote_comment(): void
    {
        [, , $vote] = $this->createVoteAt(now()->subHour());
        $otherUser = User::factory()->create();

        $this->actingAs($otherUser)->patchJson("/api/votes/{$vote->id}/comment", [
            'comment' => 'Unauthorized update',
        ])->assertForbidden();

        $this->assertSame('Original description', $vote->fresh()->travel_description);
    }

    public function test_vote_updated_at_does_not_extend_edit_window(): void
    {
        [$owner, , $vote] = $this->createVoteAt(now()->subDays(4), now());

        $this->actingAs($owner)->patchJson("/api/votes/{$vote->id}/comment", [
            'comment' => 'Should not persist',
        ])->assertForbidden();

        $this->assertSame('Original description', $vote->fresh()->travel_description);
    }

    public function test_vote_creation_post_rejects_existing_vote_as_alternative_edit_path(): void
    {
        [$owner, $location, $vote] = $this->createVoteAt(now()->subDays(4));

        $this->actingAs($owner)->postJson("/api/votes/{$location->id}", [
            'comment' => 'Bypass attempt',
        ])->assertStatus(400);

        $this->assertSame('Original description', $vote->fresh()->travel_description);
    }

    public function test_vote_owner_can_delete_comment_after_72_hours(): void
    {
        [$owner, , $vote] = $this->createVoteAt(now()->subDays(4));

        $this->actingAs($owner)
            ->deleteJson("/api/votes/{$vote->id}/comment")
            ->assertOk();

        $this->assertNull($vote->fresh()->travel_description);
    }

    private function createVoteAt(Carbon $createdAt, ?Carbon $updatedAt = null): array
    {
        $locationOwner = User::factory()->create();
        $voter = User::factory()->create();
        $location = Location::factory()->create([
            'user_id' => $locationOwner->id,
            'status' => 'pending_community_vote',
        ]);
        $vote = Vote::create([
            'user_id' => $voter->id,
            'location_id' => $location->id,
            'travel_description' => 'Original description',
        ]);

        DB::table('votes')->where('id', $vote->id)->update([
            'created_at' => $createdAt,
            'updated_at' => $updatedAt ?? $createdAt,
        ]);

        return [$voter, $location, $vote->fresh()];
    }
}
