<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Location;
use App\Models\User;
use App\Models\UserFavouriteAchievement;
use App\Models\Vote;
use App\Services\SpecialAchievementService;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FavouriteAchievementTest extends TestCase
{
    use RefreshDatabase;

    public function test_get_returns_empty_favourites(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->getJson('/api/me/favourite-achievements')
            ->assertOk()
            ->assertExactJson(['data' => []]);
    }

    public function test_it_saves_one_earned_favourite(): void
    {
        $user = User::factory()->create();
        $this->createHiddenGems($user, ['Johor']);

        $this->actingAs($user)
            ->putJson('/api/me/favourite-achievements', ['achievement_keys' => ['first-footprint']])
            ->assertOk()
            ->assertExactJson(['data' => [['key' => 'first-footprint', 'position' => 1]]]);
    }

    public function test_it_saves_two_earned_favourites_and_preserves_order(): void
    {
        $user = User::factory()->create();
        $this->createHiddenGems($user, ['Johor', 'Kedah', 'Kelantan', 'Melaka', 'Perak']);

        $expected = [
            ['key' => 'gem-hunter', 'position' => 1],
            ['key' => 'first-footprint', 'position' => 2],
        ];

        $this->actingAs($user)
            ->putJson('/api/me/favourite-achievements', [
                'achievement_keys' => ['gem-hunter', 'first-footprint'],
            ])
            ->assertOk()
            ->assertExactJson(['data' => $expected]);

        $this->actingAs($user)
            ->getJson('/api/me/favourite-achievements')
            ->assertOk()
            ->assertExactJson(['data' => $expected]);
    }

    public function test_it_removes_all_favourites(): void
    {
        $user = User::factory()->create();
        UserFavouriteAchievement::create([
            'user_id' => $user->id,
            'achievement_key' => 'first-footprint',
            'position' => 1,
        ]);

        $this->actingAs($user)
            ->putJson('/api/me/favourite-achievements', ['achievement_keys' => []])
            ->assertOk()
            ->assertExactJson(['data' => []]);

        $this->assertDatabaseHas('user_achievements', [
            'user_id' => $user->id,
            'achievement_key' => 'first-footprint',
            'position' => null,
        ]);
    }

    public function test_duplicate_keys_are_rejected(): void
    {
        $user = User::factory()->create();
        $this->createHiddenGems($user, ['Johor', 'Kedah', 'Kelantan', 'Melaka', 'Perak']);

        $this->actingAs($user)
            ->putJson('/api/me/favourite-achievements', [
                'achievement_keys' => ['gem-hunter', 'gem-hunter'],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('achievement_keys.1');
    }

    public function test_more_than_two_keys_are_rejected(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->putJson('/api/me/favourite-achievements', [
                'achievement_keys' => ['first-footprint', 'gem-hunter', 'halfway-there'],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('achievement_keys');
    }

    public function test_unknown_and_region_stamp_like_keys_are_rejected(): void
    {
        $user = User::factory()->create();

        foreach (['unknown-achievement', 'johor'] as $key) {
            $this->actingAs($user)
                ->putJson('/api/me/favourite-achievements', ['achievement_keys' => [$key]])
                ->assertUnprocessable()
                ->assertJsonValidationErrors('achievement_keys.0');
        }
    }

    public function test_unearned_achievement_is_rejected(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->putJson('/api/me/favourite-achievements', ['achievement_keys' => ['hiddenmy-master']])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('achievement_keys');
    }

    public function test_one_user_cannot_affect_another_users_favourites(): void
    {
        $firstUser = User::factory()->create();
        $secondUser = User::factory()->create();
        $this->createHiddenGems($firstUser, ['Johor']);
        $this->createHiddenGems($secondUser, ['Kedah']);

        UserFavouriteAchievement::create([
            'user_id' => $secondUser->id,
            'achievement_key' => 'first-footprint',
            'position' => 1,
        ]);

        $this->actingAs($firstUser)
            ->putJson('/api/me/favourite-achievements', ['achievement_keys' => []])
            ->assertOk();

        $this->assertDatabaseHas('user_achievements', [
            'user_id' => $secondUser->id,
            'achievement_key' => 'first-footprint',
            'position' => 1,
        ]);
    }

    public function test_database_prevents_duplicate_achievement_keys(): void
    {
        $user = User::factory()->create();
        UserFavouriteAchievement::create([
            'user_id' => $user->id,
            'achievement_key' => 'first-footprint',
            'position' => 1,
        ]);

        $this->expectException(QueryException::class);

        UserFavouriteAchievement::create([
            'user_id' => $user->id,
            'achievement_key' => 'first-footprint',
            'position' => 2,
        ]);
    }

    public function test_database_prevents_duplicate_positions(): void
    {
        $user = User::factory()->create();
        UserFavouriteAchievement::create([
            'user_id' => $user->id,
            'achievement_key' => 'first-footprint',
            'position' => 1,
        ]);

        $this->expectException(QueryException::class);

        UserFavouriteAchievement::create([
            'user_id' => $user->id,
            'achievement_key' => 'gem-hunter',
            'position' => 1,
        ]);
    }

    public function test_off_the_beaten_path_excludes_normalized_others_category(): void
    {
        $user = User::factory()->create();
        $nature = Category::create(['name' => 'Nature']);
        Category::create(['name' => '  OTHERS  ']);
        $this->createHiddenGems($user, ['Johor'], $nature);

        $this->actingAs($user)
            ->putJson('/api/me/favourite-achievements', ['achievement_keys' => ['off-the-beaten-path']])
            ->assertOk();
    }

    public function test_off_the_beaten_path_is_not_earned_when_no_meaningful_category_exists(): void
    {
        $user = User::factory()->create();
        $others = Category::create(['name' => 'Others']);
        $this->createHiddenGems($user, ['Johor'], $others);

        $this->actingAs($user)
            ->putJson('/api/me/favourite-achievements', ['achievement_keys' => ['off-the-beaten-path']])
            ->assertUnprocessable();
    }

    public function test_hidden_gem_is_the_only_successful_location_status_counted(): void
    {
        $user = User::factory()->create();
        $location = Location::factory()->create(['user_id' => $user->id, 'status' => 'verified']);

        $this->actingAs($user)
            ->putJson('/api/me/favourite-achievements', ['achievement_keys' => ['first-footprint']])
            ->assertUnprocessable();

        $location->update(['status' => 'hidden_gem']);

        $this->actingAs($user)
            ->putJson('/api/me/favourite-achievements', ['achievement_keys' => ['first-footprint']])
            ->assertOk();
    }

    public function test_voice_of_the_community_counts_distinct_votes_by_the_current_user(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $locations = Location::factory()->count(6)->create();

        foreach ($locations->take(4) as $location) {
            Vote::create(['user_id' => $user->id, 'location_id' => $location->id]);
        }
        Vote::create(['user_id' => $otherUser->id, 'location_id' => $locations[4]->id]);

        $this->actingAs($user)
            ->putJson('/api/me/favourite-achievements', ['achievement_keys' => ['voice-of-the-community']])
            ->assertUnprocessable();

        Vote::create(['user_id' => $user->id, 'location_id' => $locations[5]->id]);

        $this->actingAs($user)
            ->putJson('/api/me/favourite-achievements', ['achievement_keys' => ['voice-of-the-community']])
            ->assertOk();
    }

    public function test_region_achievements_use_all_required_regions_and_malacca_alias(): void
    {
        $user = User::factory()->create();
        $regions = SpecialAchievementService::ALL_REGIONS;
        $regions[array_search('Melaka', $regions, true)] = 'Malacca';
        $this->createHiddenGems($user, $regions);

        app(SpecialAchievementService::class)->sync($user);
        $states = app(SpecialAchievementService::class)->earnedStates($user->fresh());

        $this->assertTrue($states['halfway-there']);
        $this->assertTrue($states['west-malaysia-explorer']);
        $this->assertTrue($states['east-malaysia-explorer']);
        $this->assertTrue($states['hiddenmy-master']);
    }

    public function test_get_keeps_a_permanently_earned_favourite(): void
    {
        $user = User::factory()->create();
        UserFavouriteAchievement::create([
            'user_id' => $user->id,
            'achievement_key' => 'gem-hunter',
            'position' => 1,
        ]);

        $this->actingAs($user)
            ->getJson('/api/me/favourite-achievements')
            ->assertOk()
            ->assertExactJson(['data' => [[
                'key' => 'gem-hunter',
                'position' => 1,
            ]]]);
    }

    private function createHiddenGems(User $user, array $regions, ?Category $category = null): void
    {
        $category ??= Category::factory()->create();

        foreach ($regions as $region) {
            Location::factory()->create([
                'user_id' => $user->id,
                'category_id' => $category->id,
                'state' => $region,
                'status' => 'hidden_gem',
            ]);
        }
    }
}
