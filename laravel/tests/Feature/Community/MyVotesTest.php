<?php

namespace Tests\Feature\Community;

use App\Models\Location;
use App\Models\LocationImage;
use App\Models\User;
use App\Models\Vote;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class MyVotesTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_authentication_is_required(): void
    {
        $this->getJson('/api/my-votes')->assertUnauthorized();
    }

    public function test_it_returns_only_the_authenticated_users_vote_history(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $location = Location::factory()->create(['place_name' => 'Forest Hideaway']);
        LocationImage::create([
            'location_id' => $location->id,
            'image_url' => 'https://example.test/forest.jpg',
        ]);
        $ownVote = Vote::create(['user_id' => $user->id, 'location_id' => $location->id]);
        Vote::create([
            'user_id' => $otherUser->id,
            'location_id' => Location::factory()->create()->id,
        ]);

        $response = $this->actingAs($user)->getJson('/api/my-votes')->assertOk();

        $response->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $ownVote->id)
            ->assertJsonPath('data.0.location_available', true)
            ->assertJsonPath('data.0.location.id', $location->id)
            ->assertJsonPath('data.0.location.place_name', 'Forest Hideaway')
            ->assertJsonPath('data.0.location.first_image.image_url', 'https://example.test/forest.jpg')
            ->assertJsonMissingPath('data.0.comment')
            ->assertJsonMissingPath('data.0.photo_path');
    }

    public function test_deleted_and_archived_targets_keep_vote_history_without_exposing_location(): void
    {
        $user = User::factory()->create();

        foreach ([Location::STATUS_DELETED, Location::STATUS_ARCHIVED] as $status) {
            $location = Location::factory()->create([
                'place_name' => 'Unavailable place',
                'status' => $status,
            ]);
            Vote::create(['user_id' => $user->id, 'location_id' => $location->id]);
        }

        $response = $this->actingAs($user)->getJson('/api/my-votes')->assertOk();

        $response->assertJsonCount(2, 'data');
        foreach ($response->json('data') as $vote) {
            $this->assertFalse($vote['location_available']);
            $this->assertNull($vote['location']);
        }

        $this->assertDatabaseCount('votes', 2);
    }

    public function test_vote_history_is_returned_newest_first(): void
    {
        $user = User::factory()->create();
        $currentTime = now();

        Carbon::setTestNow($currentTime->copy()->subDay());
        $olderVote = Vote::create([
            'user_id' => $user->id,
            'location_id' => Location::factory()->create()->id,
        ]);

        Carbon::setTestNow($currentTime);
        $newerVote = Vote::create([
            'user_id' => $user->id,
            'location_id' => Location::factory()->create()->id,
        ]);

        $this->actingAs($user)->getJson('/api/my-votes')
            ->assertOk()
            ->assertJsonPath('data.0.id', $newerVote->id)
            ->assertJsonPath('data.1.id', $olderVote->id);
    }
}
