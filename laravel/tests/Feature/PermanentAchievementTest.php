<?php

namespace Tests\Feature;

use App\Models\Location;
use App\Models\User;
use App\Models\UserAchievement;
use App\Services\SpecialAchievementService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PermanentAchievementTest extends TestCase
{
    use RefreshDatabase;

    public function test_sync_persists_special_and_region_awards_idempotently(): void
    {
        $user = User::factory()->create();
        Location::factory()->for($user)->create([
            'status' => 'hidden_gem',
            'state' => 'Malacca',
        ]);

        $this->actingAs($user)->postJson('/api/me/achievements/sync')
            ->assertOk();
        $this->actingAs($user)->postJson('/api/me/achievements/sync')
            ->assertOk();

        $this->assertDatabaseHas('user_achievements', [
            'user_id' => $user->id,
            'achievement_key' => 'first-footprint',
            'achievement_type' => 'special',
            'position' => null,
        ]);
        $this->assertDatabaseHas('user_achievements', [
            'user_id' => $user->id,
            'achievement_key' => 'region:melaka',
            'achievement_type' => 'region_stamp',
            'position' => null,
        ]);
        $awards = UserAchievement::query()->where('user_id', $user->id);
        $this->assertSame(
            $awards->count(),
            $awards->distinct()->count('achievement_key')
        );
    }

    public function test_persisted_awards_remain_after_source_gem_is_delisted(): void
    {
        $user = User::factory()->create();
        $gem = Location::factory()->for($user)->create([
            'status' => 'hidden_gem',
            'state' => 'Johor',
        ]);
        $service = app(SpecialAchievementService::class);
        $service->sync($user);
        $earnedAt = UserAchievement::query()
            ->where('user_id', $user->id)
            ->where('achievement_key', 'first-footprint')
            ->value('earned_at');

        $gem->update(['status' => 'delisted']);
        $service->sync($user->fresh());

        $this->assertTrue($service->earnedStates($user->fresh())['first-footprint']);
        $this->assertDatabaseHas('user_achievements', [
            'user_id' => $user->id,
            'achievement_key' => 'region:johor',
        ]);
        $this->assertEquals($earnedAt, UserAchievement::query()
            ->where('user_id', $user->id)
            ->where('achievement_key', 'first-footprint')
            ->value('earned_at'));
    }

    public function test_unfavouriting_preserves_award_and_earned_time(): void
    {
        $user = User::factory()->create();
        Location::factory()->for($user)->create(['status' => 'hidden_gem']);
        $this->actingAs($user)->postJson('/api/me/achievements/sync')->assertOk();
        $this->actingAs($user)->putJson('/api/me/favourite-achievements', [
            'achievement_keys' => ['first-footprint'],
        ])->assertOk();
        $award = UserAchievement::query()
            ->where('user_id', $user->id)
            ->where('achievement_key', 'first-footprint')
            ->firstOrFail();

        $this->actingAs($user)->putJson('/api/me/favourite-achievements', [
            'achievement_keys' => [],
        ])->assertOk()->assertExactJson(['data' => []]);

        $award->refresh();
        $this->assertNull($award->position);
        $this->assertNotNull($award->earned_at);
    }

    public function test_region_stamp_cannot_be_selected_as_a_favourite(): void
    {
        $user = User::factory()->create();
        UserAchievement::create([
            'user_id' => $user->id,
            'achievement_key' => 'region:johor',
            'achievement_type' => 'region_stamp',
            'earned_at' => now(),
        ]);

        $this->actingAs($user)->putJson('/api/me/favourite-achievements', [
            'achievement_keys' => ['region:johor'],
        ])->assertUnprocessable();
    }
}
