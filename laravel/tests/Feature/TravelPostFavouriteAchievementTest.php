<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Location;
use App\Models\TravelPost;
use App\Models\User;
use App\Models\UserFavouriteAchievement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TravelPostFavouriteAchievementTest extends TestCase
{
    use RefreshDatabase;

    public function test_post_author_with_no_favourites_returns_an_empty_list(): void
    {
        $author = User::factory()->create();
        $this->createPost($author);

        $this->getJson('/api/travel-posts')
            ->assertOk()
            ->assertJsonPath('data.0.user.favourite_achievements', []);
    }

    public function test_post_author_with_one_active_favourite_exposes_one_key(): void
    {
        $author = User::factory()->create();
        $this->createPost($author);
        $this->createHiddenGems($author, 1);
        $this->createFavourite($author, 'first-footprint', 1);

        $this->getJson('/api/travel-posts')
            ->assertOk()
            ->assertJsonPath('data.0.user.favourite_achievements', [
                ['key' => 'first-footprint', 'position' => 1],
            ]);
    }

    public function test_post_detail_preserves_two_active_favourites_in_position_order(): void
    {
        $author = User::factory()->create();
        $post = $this->createPost($author);
        $this->createHiddenGems($author, 5);
        $this->createFavourite($author, 'first-footprint', 2);
        $this->createFavourite($author, 'gem-hunter', 1);

        $this->getJson("/api/travel-posts/{$post->id}")
            ->assertOk()
            ->assertJsonPath('data.user.favourite_achievements', [
                ['key' => 'gem-hunter', 'position' => 1],
                ['key' => 'first-footprint', 'position' => 2],
            ]);
    }

    public function test_permanently_earned_favourite_remains_exposed(): void
    {
        $author = User::factory()->create();
        $this->createPost($author);
        $this->createFavourite($author, 'hiddenmy-master', 1);

        $this->getJson('/api/travel-posts')
            ->assertOk()
            ->assertJsonPath('data.0.user.favourite_achievements', [
                ['key' => 'hiddenmy-master', 'position' => 1],
            ]);
    }

    public function test_region_stamp_like_key_is_not_exposed(): void
    {
        $author = User::factory()->create();
        $this->createPost($author);
        $this->createHiddenGems($author, 1);
        $this->createFavourite($author, 'johor', 1);

        $this->getJson('/api/travel-posts')
            ->assertOk()
            ->assertJsonPath('data.0.user.favourite_achievements', []);
    }

    public function test_authenticated_viewers_favourites_do_not_replace_post_authors_favourites(): void
    {
        $author = User::factory()->create();
        $viewer = User::factory()->create();
        $this->createPost($author);
        $this->createHiddenGems($author, 1);
        $this->createHiddenGems($viewer, 5);
        $this->createFavourite($author, 'first-footprint', 1);
        $this->createFavourite($viewer, 'gem-hunter', 1);

        $this->actingAs($viewer)
            ->getJson('/api/travel-posts')
            ->assertOk()
            ->assertJsonPath('data.0.user.favourite_achievements', [
                ['key' => 'first-footprint', 'position' => 1],
            ]);
    }

    private function createPost(User $author): TravelPost
    {
        return TravelPost::create([
            'user_id' => $author->id,
            'title' => 'A hidden journey',
            'body' => 'A story about somewhere worth exploring.',
        ]);
    }

    private function createHiddenGems(User $user, int $count): void
    {
        $category = Category::factory()->create();

        Location::factory()->count($count)->create([
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
