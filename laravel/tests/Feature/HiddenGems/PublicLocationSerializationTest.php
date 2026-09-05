<?php

namespace Tests\Feature\HiddenGems;

use App\Models\Category;
use App\Models\Location;
use App\Models\LocationImage;
use App\Models\TravelPost;
use App\Models\User;
use App\Models\UserFavouriteAchievement;
use App\Models\Vote;
use App\Services\HiddenGems\HiddenGemSearch;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PublicLocationSerializationTest extends TestCase
{
    use RefreshDatabase;

    private const INTERNAL_FIELDS = [
        'ai_review_reason',
        'ai_reviewed_at',
        'verification_attempts',
        'verification_score',
        'verification_confidence',
        'google_visibility_level',
        'hiddenness_score',
        'legitimacy_score',
        'legitimacy_level',
        'tourism_value_score',
        'tourism_value_level',
        'evidence_score',
        'evidence_level',
        'duplicate_status',
        'duplicate_of_location_id',
        'verification_result_json',
        'verification_model',
        'is_hidden_gem',
        'isHidden',
        'created_at',
        'updated_at',
    ];

    public function test_public_hidden_gem_list_recent_and_popular_return_only_public_location_data(): void
    {
        [$gem] = $this->createPublicGemWithInternalData();

        foreach ([
            ['/api/hidden-gems', 'data.0'],
            ['/api/recent-hidden-gems', '0'],
            ['/api/popular-hidden-gems', '0'],
        ] as [$uri, $path]) {
            $payload = $this->getJson($uri)->assertOk()->json($path);

            $this->assertPublicLocationFields($payload, $gem);
            $this->assertInternalFieldsAbsent($payload);
        }
    }

    public function test_public_detail_is_safe_for_guest_and_authenticated_non_owner_while_preserving_detail_data(): void
    {
        [$gem, $owner] = $this->createPublicGemWithInternalData();
        $voter = User::factory()->create();
        Vote::create([
            'user_id' => $voter->id,
            'location_id' => $gem->id,
            'travel_description' => 'Public vote story.',
        ]);
        UserFavouriteAchievement::create([
            'user_id' => $owner->id,
            'achievement_key' => 'first-footprint',
            'position' => 1,
        ]);

        $guestPayload = $this->getJson("/api/hidden-gems/{$gem->id}")
            ->assertOk()
            ->json('data');
        $this->assertPublicDetailFields($guestPayload, $gem, $owner, $voter);

        Sanctum::actingAs(User::factory()->create());
        $nonOwnerPayload = $this->getJson("/api/hidden-gems/{$gem->id}")
            ->assertOk()
            ->json('data');
        $this->assertPublicDetailFields($nonOwnerPayload, $gem, $owner, $voter);
    }

    public function test_map_viewport_and_search_remain_constrained_and_keep_required_map_data(): void
    {
        [$gem] = $this->createPublicGemWithInternalData();

        $mapPayload = $this->getJson('/api/hidden-gems-in-bounds?'.http_build_query([
            'north' => 6,
            'south' => 1,
            'east' => 110,
            'west' => 100,
        ]))->assertOk()->json('data.0');

        $this->assertSame($gem->id, $mapPayload['id']);
        $this->assertSame((float) $gem->latitude, (float) $mapPayload['latitude']);
        $this->assertSame((float) $gem->longitude, (float) $mapPayload['longitude']);
        $this->assertSame('under_review', $mapPayload['report_status']);
        $this->assertSame(4, $mapPayload['vote_count']);
        $this->assertSame(10, $mapPayload['verification_threshold']);
        $this->assertSame('Nature', $mapPayload['category']['name']);
        $this->assertSame('https://example.test/gem.jpg', $mapPayload['first_image']['image_url']);
        $this->assertInternalFieldsAbsent($mapPayload);

        $searchPayload = app(HiddenGemSearch::class)->locationResult($gem);

        $this->assertSame($gem->id, $searchPayload['id']);
        $this->assertSame($gem->place_name, $searchPayload['name']);
        $this->assertSame((float) $gem->latitude, (float) $searchPayload['latitude']);
        $this->assertSame((float) $gem->longitude, (float) $searchPayload['longitude']);
        $this->assertInternalFieldsAbsent($searchPayload);
    }

    public function test_public_travel_post_locations_keep_card_map_and_pivot_data_without_internal_fields(): void
    {
        [$gem, $author] = $this->createPublicGemWithInternalData();
        $post = TravelPost::create([
            'user_id' => $author->id,
            'title' => 'Location serialization journey',
            'body' => 'A public post with a tagged Hidden Gem.',
        ]);
        $post->locations()->attach($gem->id, [
            'caption' => 'A memorable stop.',
            'order_number' => 1,
            'visited' => true,
        ]);

        foreach ([
            ['/api/travel-posts', 'data.0.locations.0'],
            ["/api/travel-posts/{$post->id}", 'data.locations.0'],
        ] as [$uri, $path]) {
            $location = $this->getJson($uri)->assertOk()->json($path);

            $this->assertPublicLocationFields($location, $gem);
            $this->assertSame('Nature', $location['category']['name']);
            $this->assertSame('https://example.test/gem.jpg', $location['images'][0]['image_url']);
            $this->assertSame('A memorable stop.', $location['pivot']['caption']);
            $this->assertTrue((bool) $location['pivot']['visited']);
            $this->assertInternalFieldsAbsent($location);
        }
    }

    public function test_public_profile_contains_only_public_gems_and_preserves_card_progress_data(): void
    {
        $owner = User::factory()->create();
        $category = Category::factory()->create(['name' => 'Nature']);
        $publicVoting = Location::factory()->for($owner)->create([
            'category_id' => $category->id,
            'status' => 'pending_community_vote',
            'vote_count' => 3,
            'verification_threshold' => 10,
        ]);
        LocationImage::create([
            'location_id' => $publicVoting->id,
            'image_url' => 'https://example.test/profile-gem.jpg',
        ]);

        foreach (['hidden_gem', 'ai_rejected', 'pending', 'delisted', 'deleted'] as $status) {
            Location::factory()->for($owner)->create([
                'category_id' => $category->id,
                'status' => $status,
            ]);
        }

        $gems = $this->getJson("/api/users/{$owner->id}")
            ->assertOk()
            ->json('gems');

        $this->assertCount(2, $gems);
        $this->assertEqualsCanonicalizing(
            ['pending_community_vote', 'hidden_gem'],
            array_column($gems, 'status')
        );

        $votingPayload = collect($gems)->firstWhere('id', $publicVoting->id);
        $this->assertSame(3, $votingPayload['vote_count']);
        $this->assertSame(10, $votingPayload['verification_threshold']);
        $this->assertSame('Nature', $votingPayload['category']['name']);
        $this->assertSame('https://example.test/profile-gem.jpg', $votingPayload['images'][0]['image_url']);
    }

    public function test_owner_workflows_keep_ai_rejection_reason(): void
    {
        $owner = User::factory()->create();
        $gem = Location::factory()->for($owner)->create([
            'status' => 'ai_rejected',
            'ai_review_reason' => 'Owner-visible rejection explanation.',
        ]);
        Sanctum::actingAs($owner);

        $this->getJson('/api/my-hidden-gems')
            ->assertOk()
            ->assertJsonPath('data.0.ai_review_reason', 'Owner-visible rejection explanation.');

        $this->getJson("/api/hidden-gems/{$gem->id}")
            ->assertOk()
            ->assertJsonPath('data.ai_review_reason', 'Owner-visible rejection explanation.');
    }

    private function createPublicGemWithInternalData(): array
    {
        $owner = User::factory()->create();
        $category = Category::factory()->create(['name' => 'Nature']);
        $duplicate = Location::factory()->for($owner)->create([
            'category_id' => $category->id,
            'status' => 'pending',
        ]);
        $gem = Location::factory()->for($owner)->create([
            'category_id' => $category->id,
            'place_name' => 'Serialization Test Waterfall',
            'address' => '1 Hidden Trail, Pahang',
            'state' => 'Pahang',
            'description' => 'A public description.',
            'latitude' => 3.5,
            'longitude' => 102.5,
            'status' => 'hidden_gem',
            'report_status' => 'under_review',
            'vote_count' => 4,
            'verification_threshold' => 10,
            'ai_review_reason' => 'Internal AI reasoning.',
            'ai_reviewed_at' => now(),
            'verification_attempts' => 2,
            'verification_score' => 84,
            'verification_confidence' => 91,
            'google_visibility_level' => 'LOW',
            'hiddenness_score' => 88,
            'legitimacy_score' => 82,
            'legitimacy_level' => 'HIGH',
            'tourism_value_score' => 79,
            'tourism_value_level' => 'HIGH',
            'evidence_score' => 76,
            'evidence_level' => 'HIGH',
            'duplicate_status' => 'POSSIBLE_DUPLICATE',
            'duplicate_of_location_id' => $duplicate->id,
            'verification_result_json' => ['internal' => 'raw-result'],
            'verification_model' => 'internal-model',
            'is_hidden_gem' => true,
            'isHidden' => 'yes',
        ]);
        LocationImage::create([
            'location_id' => $gem->id,
            'image_url' => 'https://example.test/gem.jpg',
        ]);

        return [$gem->fresh(), $owner];
    }

    private function assertPublicLocationFields(array $payload, Location $gem): void
    {
        $this->assertSame($gem->id, $payload['id']);
        $this->assertSame($gem->place_name, $payload['place_name']);
        $this->assertSame($gem->address, $payload['address']);
        $this->assertSame($gem->state, $payload['state']);
        $this->assertSame($gem->description, $payload['description']);
        $this->assertSame((float) $gem->latitude, (float) $payload['latitude']);
        $this->assertSame((float) $gem->longitude, (float) $payload['longitude']);
        $this->assertSame($gem->status, $payload['status']);
        $this->assertSame('under_review', $payload['report_status']);
        $this->assertSame(4, $payload['vote_count']);
        $this->assertSame(10, $payload['verification_threshold']);
    }

    private function assertPublicDetailFields(array $payload, Location $gem, User $owner, User $voter): void
    {
        $this->assertPublicLocationFields($payload, $gem);
        $this->assertSame('Nature', $payload['category']['name']);
        $this->assertSame('https://example.test/gem.jpg', $payload['images'][0]['image_url']);
        $this->assertSame($owner->id, $payload['user']['id']);
        $this->assertSame([
            ['key' => 'first-footprint', 'position' => 1],
        ], $payload['user']['favourite_achievements']);
        $this->assertSame($voter->id, $payload['votes'][0]['user']['id']);
        $this->assertSame('Public vote story.', $payload['votes'][0]['travel_description']);
        $this->assertInternalFieldsAbsent($payload);
    }

    private function assertInternalFieldsAbsent(array $payload): void
    {
        foreach (self::INTERNAL_FIELDS as $field) {
            $this->assertArrayNotHasKey($field, $payload, "Public Location payload exposed {$field}.");
        }
    }
}
