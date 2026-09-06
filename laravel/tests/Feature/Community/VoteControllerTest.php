<?php

namespace Tests\Feature\Community;

use App\Models\Category;
use App\Models\CheckIn;
use App\Models\GemInteraction;
use App\Models\Location;
use App\Models\TravelPost;
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

    public function test_qualification_preserves_verification_order_and_final_status(): void
    {
        $owner = User::factory()->create();
        $raters = User::factory()->count(51)->create();
        $category = Category::factory()->create();
        foreach ([
            ['pending', 50, 10, false, 'pending'],
            ['ai_rejected', 50, 10, false, 'ai_rejected'],
            ['pending_community_vote', 50, 9, false, 'pending_community_vote'],
            ['pending_community_vote', 50, 10, false, 'hidden_gem'],
            ['hidden_gem', 49, 10, false, 'hidden_gem'],
            ['hidden_gem', 50, 10, false, 'well_known'],
            ['hidden_gem', 51, 10, false, 'well_known'],
            ['well_known', 0, 10, false, 'well_known'],
            ['pending_community_vote', 50, 10, true, 'pending_community_vote'],
            ['hidden_gem', 50, 10, true, 'hidden_gem'],
            ['archived', 50, 10, false, 'archived'],
            ['deleted', 50, 10, false, 'deleted'],
        ] as [$status, $ratings, $votes, $closed, $expected]) {
            $gem = Location::factory()->for($owner)->create([
                'category_id' => $category->id,
                'status' => $status,
                'vote_count' => $votes,
                'verification_threshold' => 10,
                'permanently_closed_at' => $closed ? now() : null,
            ]);
            GemInteraction::withoutEvents(function () use ($gem, $raters, $ratings) {
                for ($i = 0; $i < $ratings; $i++) {
                    GemInteraction::create(['location_id' => $gem->id, 'user_id' => $raters[$i]->id, 'type' => 'comment', 'rating' => 5]);
                }
            });

            $this->assertSame($expected, Location::evaluateStatus($gem->id)->status, $status.' with '.$ratings.' ratings');
        }
    }

    public function test_mixed_valid_engagement_promotes_and_removal_does_not_downgrade(): void
    {
        $owner = User::factory()->create();
        $gem = Location::factory()->for($owner)->create(['status' => 'hidden_gem']);
        for ($i = 0; $i < 30; $i++) {
            GemInteraction::create(['location_id' => $gem->id, 'user_id' => User::factory()->create()->id, 'type' => 'comment', 'rating' => 5]);
        }
        for ($i = 0; $i < 20; $i++) {
            $post = TravelPost::create(['user_id' => $owner->id, 'title' => 'Story', 'body' => 'A visit']);
            $gem->posts()->attach($post->id);
        }
        $post->delete();
        foreach ([['comment', null], ['comment', 0], ['comment', 6], ['like', 5]] as [$type, $rating]) {
            GemInteraction::create(['location_id' => $gem->id, 'user_id' => User::factory()->create()->id, 'type' => $type, 'rating' => $rating]);
        }
        $this->assertSame('hidden_gem', Location::evaluateStatus($gem->id)->status);

        $post = TravelPost::create(['user_id' => $owner->id, 'title' => 'Another story', 'body' => 'A visit']);
        $gem->posts()->attach($post->id);
        $this->assertSame('well_known', Location::evaluateStatus($gem->id)->status);
        $gem->qualifyingRatings()->first()->delete();
        $gem->posts()->detach();
        $this->assertSame('well_known', Location::evaluateStatus($gem->id)->status);
    }

    private function coordinates(Location $location): array
    {
        return ['latitude' => $location->latitude, 'longitude' => $location->longitude];
    }
}
