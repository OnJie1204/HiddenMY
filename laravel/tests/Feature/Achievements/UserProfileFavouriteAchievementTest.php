<?php

namespace Tests\Feature\Achievements;

use App\Models\Location;
use App\Models\User;
use App\Models\UserFavouriteAchievement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserProfileFavouriteAchievementTest extends TestCase
{
    use RefreshDatabase;

    public function test_profile_owner_with_no_active_favourites_returns_an_empty_list(): void
    {
        $profileOwner = User::factory()->create();

        $this->getJson("/api/users/{$profileOwner->id}")
            ->assertOk()
            ->assertJsonPath('user.favourite_achievements', []);
    }

    public function test_one_active_profile_owner_favourite_is_returned(): void
    {
        $profileOwner = User::factory()->create();
        $this->createHiddenGems($profileOwner, 1);
        $this->createFavourite($profileOwner, 'first-footprint', 1);

        $this->getJson("/api/users/{$profileOwner->id}")
            ->assertOk()
            ->assertJsonPath('user.favourite_achievements', [
                ['key' => 'first-footprint', 'position' => 1],
            ]);
    }

    public function test_two_active_favourites_preserve_position_order(): void
    {
        $profileOwner = User::factory()->create();
        $this->createHiddenGems($profileOwner, 5);
        $this->createFavourite($profileOwner, 'first-footprint', 2);
        $this->createFavourite($profileOwner, 'gem-hunter', 1);

        $this->getJson("/api/users/{$profileOwner->id}")
            ->assertOk()
            ->assertJsonPath('user.favourite_achievements', [
                ['key' => 'gem-hunter', 'position' => 1],
                ['key' => 'first-footprint', 'position' => 2],
            ]);
    }

    public function test_permanently_earned_favourite_is_preserved(): void
    {
        $profileOwner = User::factory()->create();
        $this->createFavourite($profileOwner, 'gem-hunter', 1);

        $this->getJson("/api/users/{$profileOwner->id}")
            ->assertOk()
            ->assertJsonPath('user.favourite_achievements', [
                ['key' => 'gem-hunter', 'position' => 1],
            ]);
    }

    public function test_unknown_or_region_stamp_like_key_is_not_exposed(): void
    {
        $profileOwner = User::factory()->create();
        $this->createHiddenGems($profileOwner, 1);
        $this->createFavourite($profileOwner, 'johor-region-stamp', 1);

        $this->getJson("/api/users/{$profileOwner->id}")
            ->assertOk()
            ->assertJsonPath('user.favourite_achievements', []);
    }

    public function test_viewers_favourites_are_not_substituted_for_profile_owners(): void
    {
        $viewer = User::factory()->create();
        $profileOwner = User::factory()->create();
        $this->createHiddenGems($viewer, 1);
        $this->createFavourite($viewer, 'first-footprint', 1);

        $this->actingAs($viewer)->getJson("/api/users/{$profileOwner->id}")
            ->assertOk()
            ->assertJsonPath('user.id', $profileOwner->id)
            ->assertJsonPath('user.favourite_achievements', []);
    }

    public function test_viewing_own_id_returns_that_profile_owners_favourites(): void
    {
        $profileOwner = User::factory()->create();
        $this->createHiddenGems($profileOwner, 1);
        $this->createFavourite($profileOwner, 'first-footprint', 1);

        $this->actingAs($profileOwner)->getJson("/api/users/{$profileOwner->id}")
            ->assertOk()
            ->assertJsonPath('user.favourite_achievements.0.key', 'first-footprint');
    }

    public function test_existing_public_profile_user_and_gem_data_remains_present(): void
    {
        $profileOwner = User::factory()->create(['name' => 'Public Explorer']);
        $location = Location::factory()->create([
            'user_id' => $profileOwner->id,
            'place_name' => 'Quiet Cove',
            'status' => 'hidden_gem',
        ]);

        $this->getJson("/api/users/{$profileOwner->id}")
            ->assertOk()
            ->assertJsonPath('user.id', $profileOwner->id)
            ->assertJsonPath('user.name', 'Public Explorer')
            ->assertJsonPath('gems.0.id', $location->id)
            ->assertJsonPath('gems.0.place_name', 'Quiet Cove');
    }

    private function createHiddenGems(User $user, int $count): void
    {
        Location::factory()->count($count)->create([
            'user_id' => $user->id,
            'status' => 'hidden_gem',
        ]);
    }

    private function createFavourite(User $user, string $key, int $position): void
    {
        UserFavouriteAchievement::create([
            'user_id' => $user->id,
            'achievement_key' => $key,
            'position' => $position,
        ]);
    }
}
