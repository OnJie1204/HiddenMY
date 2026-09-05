<?php

namespace Tests\Feature\Achievements;

use App\Models\Location;
use App\Models\User;
use App\Models\UserAchievement;
use App\Models\Vote;
use App\Services\Achievements\SpecialAchievementService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class JourneyAchievementConsistencyTest extends TestCase
{
    use RefreshDatabase;

    public function test_journey_is_owner_only_and_returns_exact_marker_statuses_with_valid_coordinates(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $included = collect([
            'pending_community_vote',
            'hidden_gem',
            'well_known',
            'archived',
        ])->mapWithKeys(fn (string $status) => [$status => Location::factory()->for($owner)->create([
            'status' => $status,
            'latitude' => 3.139,
            'longitude' => 101.6869,
        ])]);

        foreach (['pending', 'ai_rejected', 'deleted'] as $status) {
            Location::factory()->for($owner)->create(['status' => $status]);
        }
        Location::factory()->for($owner)->create([
            'status' => 'hidden_gem',
            'latitude' => 91,
            'longitude' => 181,
        ]);
        $otherArchived = Location::factory()->for($other)->create(['status' => 'archived']);

        $this->getJson('/api/my-hidden-gem-journey')->assertUnauthorized();

        $data = $this->actingAs($owner)
            ->getJson('/api/my-hidden-gem-journey')
            ->assertOk()
            ->json('data');

        $ids = collect($data)->pluck('id');
        foreach ($included as $location) {
            $this->assertTrue($ids->contains($location->id));
        }
        $this->assertFalse($ids->contains($otherArchived->id));
        $this->assertEqualsCanonicalizing(
            ['pending_community_vote', 'hidden_gem', 'well_known', 'archived'],
            collect($data)->pluck('status')->all()
        );
    }

    public function test_archived_reconciles_lifetime_awards_but_closed_pending_vote_does_not(): void
    {
        $user = User::factory()->create();
        Location::factory()->for($user)->create([
            'status' => 'pending_community_vote',
            'state' => 'Johor',
            'permanently_closed_at' => now(),
        ]);
        Location::factory()->for($user)->create([
            'status' => 'archived',
            'state' => 'Sabah',
        ]);

        $service = app(SpecialAchievementService::class);
        $service->sync($user);
        $earnedAt = UserAchievement::where('user_id', $user->id)
            ->where('achievement_key', 'first-footprint')
            ->value('earned_at');
        $service->sync($user->fresh());

        $this->assertDatabaseHas('user_achievements', [
            'user_id' => $user->id,
            'achievement_key' => 'region:sabah',
            'achievement_type' => 'region_stamp',
        ]);
        $this->assertDatabaseMissing('user_achievements', [
            'user_id' => $user->id,
            'achievement_key' => 'region:johor',
        ]);
        $this->assertEquals($earnedAt, UserAchievement::where('user_id', $user->id)
            ->where('achievement_key', 'first-footprint')
            ->value('earned_at'));
    }

    public function test_vote_synchronises_voter_and_new_hidden_gem_owner_without_opening_achievements(): void
    {
        $owner = User::factory()->create();
        $voter = User::factory()->create();

        for ($index = 0; $index < 4; $index++) {
            $otherLocation = Location::factory()->create();
            Vote::create(['user_id' => $voter->id, 'location_id' => $otherLocation->id]);
        }

        $location = Location::factory()->for($owner)->create([
            'status' => 'pending_community_vote',
            'state' => 'Penang',
            'latitude' => 5.4141,
            'longitude' => 100.3288,
            'vote_count' => 0,
            'verification_threshold' => 1,
        ]);

        $this->actingAs($voter)->postJson("/api/votes/{$location->id}", [
            'latitude' => 5.4141,
            'longitude' => 100.3288,
        ])->assertCreated();

        $this->assertSame('hidden_gem', $location->fresh()->status);
        $this->assertDatabaseHas('user_achievements', [
            'user_id' => $owner->id,
            'achievement_key' => 'first-footprint',
        ]);
        $this->assertDatabaseHas('user_achievements', [
            'user_id' => $owner->id,
            'achievement_key' => 'region:penang',
        ]);
        $this->assertDatabaseHas('user_achievements', [
            'user_id' => $voter->id,
            'achievement_key' => 'voice-of-the-community',
        ]);
    }
}
