<?php

namespace Tests\Feature\HiddenGems;

use App\Models\Location;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class HiddenGemDetailVisibilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_can_view_a_public_hidden_gem(): void
    {
        $gem = Location::factory()->create(['status' => 'pending_community_vote']);

        $this->getJson("/api/hidden-gems/{$gem->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $gem->id);
    }

    public function test_authenticated_non_owner_can_view_a_public_hidden_gem(): void
    {
        $viewer = User::factory()->create();
        $gem = Location::factory()->create(['status' => 'hidden_gem']);

        Sanctum::actingAs($viewer);

        $this->getJson("/api/hidden-gems/{$gem->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $gem->id);
    }

    public function test_owner_can_view_their_own_pending_submission(): void
    {
        $owner = User::factory()->create();
        $gem = Location::factory()->for($owner)->create(['status' => 'pending']);

        Sanctum::actingAs($owner);

        $this->getJson("/api/hidden-gems/{$gem->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $gem->id);
    }

    public function test_owner_bearer_token_can_view_their_own_pending_submission(): void
    {
        $owner = User::factory()->create();
        $gem = Location::factory()->for($owner)->create(['status' => 'pending']);
        $token = $owner->createToken('hidden-gem-detail-test')->plainTextToken;

        $this->withToken($token)
            ->getJson("/api/hidden-gems/{$gem->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $gem->id);
    }

    public function test_owner_can_view_their_own_ai_rejected_submission(): void
    {
        $owner = User::factory()->create();
        $gem = Location::factory()->for($owner)->create(['status' => 'ai_rejected']);

        Sanctum::actingAs($owner);

        $this->getJson("/api/hidden-gems/{$gem->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $gem->id);
    }

    public function test_owner_bearer_token_can_view_their_own_ai_rejected_submission(): void
    {
        $owner = User::factory()->create();
        $gem = Location::factory()->for($owner)->create(['status' => 'ai_rejected']);
        $token = $owner->createToken('hidden-gem-detail-test')->plainTextToken;

        $this->withToken($token)
            ->getJson("/api/hidden-gems/{$gem->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $gem->id);
    }

    public function test_guest_cannot_view_a_non_public_submission_by_id(): void
    {
        $gem = Location::factory()->create(['status' => 'pending']);

        $this->getJson("/api/hidden-gems/{$gem->id}")
            ->assertNotFound();
    }

    public function test_authenticated_non_owner_cannot_view_another_users_non_public_submission_by_id(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $gem = Location::factory()->for($owner)->create(['status' => 'ai_rejected']);

        Sanctum::actingAs($viewer);

        $this->getJson("/api/hidden-gems/{$gem->id}")
            ->assertNotFound();
    }

    public function test_non_owner_bearer_token_cannot_view_another_users_non_public_submission(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $gem = Location::factory()->for($owner)->create(['status' => 'pending']);
        $token = $viewer->createToken('hidden-gem-detail-test')->plainTextToken;

        $this->withToken($token)
            ->getJson("/api/hidden-gems/{$gem->id}")
            ->assertNotFound();
    }

    public function test_deleted_gem_is_invisible_to_everyone_including_its_owner(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $gem = Location::factory()->for($owner)->create(['status' => 'deleted']);

        Sanctum::actingAs($owner);
        $this->getJson("/api/hidden-gems/{$gem->id}")->assertNotFound();

        Sanctum::actingAs($viewer);
        $this->getJson("/api/hidden-gems/{$gem->id}")->assertNotFound();
    }

    public function test_archived_gem_is_invisible_to_everyone_including_its_owner(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $gem = Location::factory()->for($owner)->create(['status' => 'archived']);

        $this->getJson("/api/hidden-gems/{$gem->id}")->assertNotFound();

        Sanctum::actingAs($owner);
        $this->getJson("/api/hidden-gems/{$gem->id}")->assertNotFound();

        Sanctum::actingAs($viewer);
        $this->getJson("/api/hidden-gems/{$gem->id}")->assertNotFound();
    }

    public function test_permanently_closed_gems_are_excluded_from_discovery_but_keep_direct_history_access(): void
    {
        $open = Location::factory()->create(['status' => 'hidden_gem', 'latitude' => 3.139, 'longitude' => 101.6869]);
        $closed = collect(['pending_community_vote', 'hidden_gem', 'well_known'])->map(fn ($status) => Location::factory()->create([
            'status' => $status,
            'latitude' => 3.139,
            'longitude' => 101.6869,
            'permanently_closed_at' => now(),
        ]));

        foreach ([
            '/api/hidden-gems',
            '/api/hidden-gems?include_well_known=1',
            '/api/well-known-places',
            '/api/hidden-gems-in-bounds?north=4&south=2&east=102&west=101',
            '/api/recent-hidden-gems',
            '/api/popular-hidden-gems',
            '/api/hidden-gems/'.$open->id.'/nearby-gems',
        ] as $url) {
            $response = $this->getJson($url)->assertOk();
            foreach ($closed as $gem) {
                $response->assertJsonMissing(['id' => $gem->id]);
            }
        }
        $this->getJson('/api/hidden-gems')->assertJsonFragment(['id' => $open->id]);
        foreach ($closed as $gem) {
            $this->getJson('/api/hidden-gems/'.$gem->id)->assertOk();
        }
    }

    public function test_archived_gem_is_excluded_from_public_lists_maps_and_search(): void
    {
        $gem = Location::factory()->create([
            'status' => 'archived',
            'place_name' => 'Archived Search Place',
            'latitude' => 3.139,
            'longitude' => 101.6869,
        ]);

        $this->getJson('/api/hidden-gems?include_well_known=1')
            ->assertOk()
            ->assertJsonMissing(['id' => $gem->id]);

        $this->getJson('/api/hidden-gems-in-bounds?north=4&south=2&east=102&west=101')
            ->assertOk()
            ->assertJsonMissing(['id' => $gem->id]);

        // HiddenGemSearch uses this same scope before applying its PostgreSQL
        // ILIKE expression, which SQLite cannot execute in the test suite.
        $this->assertFalse(Location::publiclyVisible()->whereKey($gem->id)->exists());
    }
}
