<?php

namespace Tests\Feature\Users;

use App\Models\GemInteraction;
use App\Models\Location;
use App\Models\TravelPost;
use App\Models\User;
use App\Models\UserFavouriteAchievement;
use App\Models\Vote;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PublicUserSerializationTest extends TestCase
{
    use RefreshDatabase;

    private const PRIVATE_USER_FIELDS = [
        'email',
        'email_verified_at',
        'google_id',
        'pending_email',
        'email_change_token',
        'failed_login_attempts',
        'locked_until',
        'password',
        'remember_token',
        'created_at',
        'updated_at',
    ];

    public function test_public_profile_returns_safe_identity_member_since_and_active_favourites(): void
    {
        $owner = $this->createUserWithSensitiveData();
        Location::factory()->for($owner)->create(['status' => 'hidden_gem']);
        UserFavouriteAchievement::create([
            'user_id' => $owner->id,
            'achievement_key' => 'first-footprint',
            'position' => 1,
        ]);

        $response = $this->getJson("/api/users/{$owner->id}")->assertOk();
        $publicUser = $response->json('user');

        $this->assertSame($owner->id, $publicUser['id']);
        $this->assertSame($owner->name, $publicUser['name']);
        $this->assertSame($owner->avatar_url, $publicUser['avatar_url']);
        $this->assertArrayHasKey('created_at', $publicUser);
        $this->assertSame([
            ['key' => 'first-footprint', 'position' => 1],
        ], $publicUser['favourite_achievements']);
        $this->assertPrivateFieldsAbsent($publicUser, except: ['created_at']);
    }

    public function test_hidden_gem_public_responses_shape_submitters_and_voters_safely(): void
    {
        $submitter = $this->createUserWithSensitiveData();
        $voter = $this->createUserWithSensitiveData();
        $gem = Location::factory()->for($submitter)->create(['status' => 'hidden_gem']);
        UserFavouriteAchievement::create([
            'user_id' => $submitter->id,
            'achievement_key' => 'first-footprint',
            'position' => 1,
        ]);
        Vote::create([
            'user_id' => $voter->id,
            'location_id' => $gem->id,
        ]);

        foreach (['/api/hidden-gems', '/api/recent-hidden-gems', '/api/popular-hidden-gems'] as $uri) {
            $response = $this->getJson($uri)->assertOk();
            $user = $uri === '/api/hidden-gems'
                ? $response->json('data.0.user')
                : $response->json('0.user');

            $this->assertPublicIdentity($user, $submitter);
        }

        $detail = $this->getJson("/api/hidden-gems/{$gem->id}")->assertOk();
        $submitterPayload = $detail->json('data.user');
        $voterPayload = $detail->json('data.votes.0.user');

        $this->assertPublicIdentity($submitterPayload, $submitter);
        $this->assertSame([
            ['key' => 'first-footprint', 'position' => 1],
        ], $submitterPayload['favourite_achievements']);
        $this->assertPublicIdentity($voterPayload, $voter);
    }

    public function test_public_votes_return_safe_voter_identity_without_obsolete_story_fields(): void
    {
        $voter = $this->createUserWithSensitiveData();
        $gem = Location::factory()->create(['status' => 'pending_community_vote']);
        Vote::create([
            'user_id' => $voter->id,
            'location_id' => $gem->id,
        ]);

        $response = $this->getJson("/api/votes/{$gem->id}")->assertOk();

        $response->assertJsonMissingPath('data.0.travel_description');
        $response->assertJsonMissingPath('data.0.photo_path');
        $response->assertJsonPath('data.0.location_id', $gem->id);
        $this->assertPublicIdentity($response->json('data.0.user'), $voter);
    }

    public function test_public_interactions_return_safe_commenter_identity_and_content(): void
    {
        $commenter = $this->createUserWithSensitiveData();
        $gem = Location::factory()->create(['status' => 'hidden_gem']);
        GemInteraction::create([
            'user_id' => $commenter->id,
            'location_id' => $gem->id,
            'type' => 'comment',
            'comment' => 'A public rating comment.',
            'rating' => 4,
        ]);

        $response = $this->getJson("/api/gem-interactions/{$gem->id}")->assertOk();

        $this->assertSame('A public rating comment.', $response->json('comments.0.comment'));
        $this->assertSame(4, $response->json('comments.0.rating'));
        $this->assertPublicIdentity($response->json('comments.0.user'), $commenter);
    }

    public function test_public_travel_post_responses_shape_authors_and_preserve_favourites(): void
    {
        $author = $this->createUserWithSensitiveData();
        $gem = Location::factory()->for($author)->create(['status' => 'hidden_gem']);
        UserFavouriteAchievement::create([
            'user_id' => $author->id,
            'achievement_key' => 'first-footprint',
            'position' => 1,
        ]);
        $post = TravelPost::create([
            'user_id' => $author->id,
            'title' => 'A public journey',
            'body' => 'Public post content.',
        ]);
        $post->locations()->attach($gem->id, [
            'caption' => 'A stop',
            'order_number' => 1,
            'visited' => true,
        ]);

        foreach ([
            ['/api/travel-posts', 'data.0.user'],
            ["/api/travel-posts/{$post->id}", 'data.user'],
            ["/api/locations/{$gem->id}/travel-posts", 'data.0.user'],
        ] as [$uri, $path]) {
            $response = $this->getJson($uri)->assertOk();
            $publicAuthor = $response->json($path);

            $this->assertPublicIdentity($publicAuthor, $author);
            $this->assertSame([
                ['key' => 'first-footprint', 'position' => 1],
            ], $publicAuthor['favourite_achievements']);
        }
    }

    public function test_authenticated_me_response_keeps_private_account_information(): void
    {
        $user = $this->createUserWithSensitiveData();
        Sanctum::actingAs($user);

        $this->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('id', $user->id)
            ->assertJsonPath('email', $user->email)
            ->assertJsonPath('google_id', $user->google_id)
            ->assertJsonPath('pending_email', $user->pending_email);
    }

    private function createUserWithSensitiveData(): User
    {
        $user = User::factory()->create([
            'avatar_url' => 'https://example.test/avatar.png',
        ]);

        $user->forceFill([
            'email_verified_at' => now(),
            'google_id' => 'google-'.$user->id,
            'pending_email' => "pending-{$user->id}@example.test",
            'email_change_token' => 'change-token-'.$user->id,
            'failed_login_attempts' => 3,
            'locked_until' => now()->addHour(),
            'remember_token' => 'remember-'.$user->id,
        ])->save();

        return $user->fresh();
    }

    private function assertPublicIdentity(array $payload, User $expected): void
    {
        $this->assertSame($expected->id, $payload['id']);
        $this->assertSame($expected->name, $payload['name']);
        $this->assertSame($expected->avatar_url, $payload['avatar_url']);
        $this->assertPrivateFieldsAbsent($payload);
    }

    private function assertPrivateFieldsAbsent(array $payload, array $except = []): void
    {
        foreach (array_diff(self::PRIVATE_USER_FIELDS, $except) as $field) {
            $this->assertArrayNotHasKey($field, $payload, "Public user payload exposed {$field}.");
        }
    }
}
