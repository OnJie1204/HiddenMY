<?php

namespace Tests\Feature\Community;

use App\Models\CheckIn;
use App\Models\Location;
use App\Models\User;
use App\Models\Vote;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
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

        $response->assertStatus(400);
        $response->assertJson(['eligible' => false]);
    }

    public function test_voting_is_blocked_when_ai_rejected(): void
    {
        $owner = User::factory()->create();
        $voter = User::factory()->create();
        $location = Location::factory()->create(['user_id' => $owner->id, 'status' => 'ai_rejected']);

        $response = $this->actingAs($voter)->postJson("/api/votes/{$location->id}", $this->coordinates($location));

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

        $response = $this->actingAs($voter)->postJson("/api/votes/{$location->id}", $this->coordinates($location));

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

        $response = $this->actingAs($voter)->postJson("/api/votes/{$location->id}", $this->coordinates($location));

        $response->assertStatus(201);
        $this->assertSame('hidden_gem', $location->fresh()->status);
    }

    public function test_cannot_vote_on_already_hidden_gem(): void
    {
        $owner = User::factory()->create();
        $voter = User::factory()->create();
        $location = Location::factory()->create(['user_id' => $owner->id, 'status' => 'hidden_gem']);

        $response = $this->actingAs($voter)->postJson("/api/votes/{$location->id}", $this->coordinates($location));

        $response->assertStatus(400);
    }

    public function test_current_coordinates_are_required_even_after_check_in(): void
    {
        $voter = User::factory()->create();
        $location = Location::factory()->create(['status' => 'pending_community_vote']);
        CheckIn::create(['user_id' => $voter->id, 'location_id' => $location->id, 'check_in_at' => now()]);

        $this->actingAs($voter)->postJson("/api/votes/{$location->id}", [])
            ->assertUnprocessable()->assertJsonValidationErrors(['latitude', 'longitude']);
        $this->assertDatabaseCount('votes', 0);
    }

    public function test_voting_outside_the_five_kilometre_radius_is_rejected(): void
    {
        $voter = User::factory()->create();
        $location = Location::factory()->create(['status' => 'pending_community_vote']);

        $this->actingAs($voter)->postJson("/api/votes/{$location->id}", [
            'latitude' => $location->latitude + 1,
            'longitude' => $location->longitude,
        ])->assertUnprocessable()->assertJsonPath('max_distance', 5);
        $this->assertDatabaseCount('votes', 0);
    }

    public function test_duplicate_vote_is_rejected_without_incrementing_the_count(): void
    {
        $voter = User::factory()->create();
        $location = Location::factory()->create(['status' => 'pending_community_vote', 'vote_count' => 1]);
        Vote::create(['user_id' => $voter->id, 'location_id' => $location->id]);

        $this->actingAs($voter)->postJson("/api/votes/{$location->id}", $this->coordinates($location))
            ->assertConflict();
        $this->assertDatabaseCount('votes', 1);
        $this->assertSame(1, $location->fresh()->vote_count);
    }

    private function coordinates(Location $location): array
    {
        return ['latitude' => $location->latitude, 'longitude' => $location->longitude];
    }
}
