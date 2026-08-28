<?php

namespace Tests\Feature;

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

    public function test_delisted_gem_remains_visible_to_owner_but_not_another_authenticated_user(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $gem = Location::factory()->for($owner)->create(['status' => 'delisted']);

        Sanctum::actingAs($owner);
        $this->getJson("/api/hidden-gems/{$gem->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $gem->id);

        Sanctum::actingAs($viewer);
        $this->getJson("/api/hidden-gems/{$gem->id}")
            ->assertNotFound();
    }
}
