<?php

namespace Tests\Feature\Achievements;

use App\Models\Category;
use App\Models\Location;
use App\Models\User;
use App\Models\UserFavouriteAchievement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HiddenGemDetailFavouriteAchievementTest extends TestCase
{
    use RefreshDatabase;

    public function test_detail_returns_no_badges_when_submitter_has_no_favourites(): void
    {
        $viewer = User::factory()->create();
        $submitter = User::factory()->create();
        $gem = $this->createHiddenGems($submitter, 1)->first();

        $this->actingAs($viewer)
            ->getJson("/api/hidden-gems/{$gem->id}")
            ->assertOk()
            ->assertJsonPath('data.user.favourite_achievements', []);
    }

    public function test_detail_returns_one_active_submitter_favourite(): void
    {
        $viewer = User::factory()->create();
        $submitter = User::factory()->create();
        $gem = $this->createHiddenGems($submitter, 1)->first();
        $this->createFavourite($submitter, 'first-footprint', 1);

        $this->actingAs($viewer)
            ->getJson("/api/hidden-gems/{$gem->id}")
            ->assertOk()
            ->assertJsonPath('data.user.favourite_achievements', [
                ['key' => 'first-footprint', 'position' => 1],
            ]);
    }

    public function test_detail_returns_two_submitter_favourites_in_position_order(): void
    {
        $viewer = User::factory()->create();
        $submitter = User::factory()->create();
        $gem = $this->createHiddenGems($submitter, 5)->first();
        $this->createFavourite($submitter, 'first-footprint', 2);
        $this->createFavourite($submitter, 'gem-hunter', 1);

        $this->actingAs($viewer)
            ->getJson("/api/hidden-gems/{$gem->id}")
            ->assertOk()
            ->assertJsonPath('data.user.favourite_achievements', [
                ['key' => 'gem-hunter', 'position' => 1],
                ['key' => 'first-footprint', 'position' => 2],
            ]);
    }

    public function test_detail_keeps_permanently_earned_submitter_favourite(): void
    {
        $viewer = User::factory()->create();
        $submitter = User::factory()->create();
        $gem = $this->createHiddenGems($submitter, 1)->first();
        $this->createFavourite($submitter, 'hiddenmy-master', 1);

        $this->actingAs($viewer)
            ->getJson("/api/hidden-gems/{$gem->id}")
            ->assertOk()
            ->assertJsonPath('data.user.favourite_achievements', [
                ['key' => 'hiddenmy-master', 'position' => 1],
            ]);
    }

    public function test_viewers_favourites_are_not_substituted_for_submitters(): void
    {
        $viewer = User::factory()->create();
        $submitter = User::factory()->create();
        $gem = $this->createHiddenGems($submitter, 1)->first();
        $this->createHiddenGems($viewer, 5);
        $this->createFavourite($submitter, 'first-footprint', 1);
        $this->createFavourite($viewer, 'gem-hunter', 1);

        $this->actingAs($viewer)
            ->getJson("/api/hidden-gems/{$gem->id}")
            ->assertOk()
            ->assertJsonPath('data.user.id', $submitter->id)
            ->assertJsonPath('data.user.favourite_achievements', [
                ['key' => 'first-footprint', 'position' => 1],
            ]);
    }

    public function test_submitter_sees_their_own_badges_on_their_hidden_gem(): void
    {
        $submitter = User::factory()->create();
        $gem = $this->createHiddenGems($submitter, 1)->first();
        $this->createFavourite($submitter, 'first-footprint', 1);

        $this->actingAs($submitter)
            ->getJson("/api/hidden-gems/{$gem->id}")
            ->assertOk()
            ->assertJsonPath('data.user.favourite_achievements', [
                ['key' => 'first-footprint', 'position' => 1],
            ]);
    }

    public function test_region_stamp_like_key_is_not_exposed_on_hidden_gem_detail(): void
    {
        $viewer = User::factory()->create();
        $submitter = User::factory()->create();
        $gem = $this->createHiddenGems($submitter, 1)->first();
        $this->createFavourite($submitter, 'johor', 1);

        $this->actingAs($viewer)
            ->getJson("/api/hidden-gems/{$gem->id}")
            ->assertOk()
            ->assertJsonPath('data.user.favourite_achievements', []);
    }

    private function createHiddenGems(User $user, int $count)
    {
        $category = Category::factory()->create();

        return Location::factory()->count($count)->create([
            'user_id' => $user->id,
            'category_id' => $category->id,
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
