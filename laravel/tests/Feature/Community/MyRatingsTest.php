<?php

namespace Tests\Feature\Community;

use App\Models\GemInteraction;
use App\Models\Location;
use App\Models\LocationImage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MyRatingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_authentication_is_required(): void
    {
        $this->getJson('/api/my-ratings')->assertUnauthorized();
    }

    public function test_it_returns_only_the_authenticated_users_comment_interactions(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $location = Location::factory()->create();
        $ownRating = $this->createInteraction($user, $location, 'comment', 'My rating');
        $this->createInteraction($user, $location, 'like', null);
        $this->createInteraction($otherUser, $location, 'comment', 'Another user');

        $response = $this->actingAs($user)->getJson('/api/my-ratings')->assertOk();

        $response->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $ownRating->id)
            ->assertJsonPath('data.0.comment', 'My rating');
    }

    public function test_rating_only_record_with_null_comment_is_returned(): void
    {
        $user = User::factory()->create();
        $location = Location::factory()->create();
        $rating = $this->createInteraction($user, $location, 'comment', null);

        $this->actingAs($user)->getJson('/api/my-ratings')
            ->assertOk()
            ->assertJsonPath('data.0.id', $rating->id)
            ->assertJsonPath('data.0.comment', null)
            ->assertJsonPath('data.0.rating', 4);
    }

    public function test_related_location_and_first_image_are_returned(): void
    {
        $user = User::factory()->create();
        $location = Location::factory()->create([
            'place_name' => 'Forest Hideaway',
            'status' => 'hidden_gem',
        ]);
        LocationImage::create([
            'location_id' => $location->id,
            'image_url' => 'https://example.test/first.jpg',
        ]);
        LocationImage::create([
            'location_id' => $location->id,
            'image_url' => 'https://example.test/second.jpg',
        ]);
        $this->createInteraction($user, $location, 'comment', 'Worth visiting');

        $this->actingAs($user)->getJson('/api/my-ratings')
            ->assertOk()
            ->assertJsonPath('data.0.location_available', true)
            ->assertJsonPath('data.0.location.id', $location->id)
            ->assertJsonPath('data.0.location.place_name', 'Forest Hideaway')
            ->assertJsonPath('data.0.location.status', 'hidden_gem')
            ->assertJsonPath('data.0.location.first_image.image_url', 'https://example.test/first.jpg');
    }

    public function test_deleted_and_archived_targets_keep_rating_history_without_exposing_location(): void
    {
        $user = User::factory()->create();

        foreach ([Location::STATUS_DELETED, Location::STATUS_ARCHIVED] as $status) {
            $location = Location::factory()->create([
                'place_name' => 'Unavailable place',
                'status' => $status,
            ]);
            $this->createInteraction($user, $location, 'comment', 'Historical rating');
        }

        $response = $this->actingAs($user)->getJson('/api/my-ratings')->assertOk();

        $response->assertJsonCount(2, 'data');
        foreach ($response->json('data') as $rating) {
            $this->assertFalse($rating['location_available']);
            $this->assertNull($rating['location']);
        }

        $this->assertDatabaseCount('gem_interactions', 2);
    }

    public function test_location_without_an_image_is_handled_safely(): void
    {
        $user = User::factory()->create();
        $location = Location::factory()->create();
        $this->createInteraction($user, $location, 'comment', 'No photo needed');

        $this->actingAs($user)->getJson('/api/my-ratings')
            ->assertOk()
            ->assertJsonPath('data.0.location.id', $location->id)
            ->assertJsonPath('data.0.location.first_image', null);
    }

    private function createInteraction(
        User $user,
        Location $location,
        string $type,
        ?string $comment
    ): GemInteraction {
        return GemInteraction::create([
            'user_id' => $user->id,
            'location_id' => $location->id,
            'type' => $type,
            'comment' => $comment,
            'rating' => $type === 'comment' ? 4 : null,
        ]);
    }
}
