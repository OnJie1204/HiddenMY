<?php

namespace Tests\Feature;

use App\Jobs\VerifyHiddenGemSubmission;
use App\Models\Location;
use App\Models\User;
use App\Models\Vote;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class HiddenGemEditingTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_edit_an_unverified_hidden_gem_with_zero_votes(): void
    {
        Bus::fake([VerifyHiddenGemSubmission::class]);

        $owner = User::factory()->create();
        $gem = Location::factory()->for($owner)->create([
            'status' => 'pending_community_vote',
            'vote_count' => 0,
        ]);

        Sanctum::actingAs($owner);

        $this->putJson("/api/hidden-gems/{$gem->id}", $this->updatePayload($gem, [
            'place_name' => 'Updated Hidden Place',
            'description' => 'Updated description.',
        ]))
            ->assertOk()
            ->assertJsonPath('data.place_name', 'Updated Hidden Place');

        $this->assertDatabaseHas('locations', [
            'id' => $gem->id,
            'place_name' => 'Updated Hidden Place',
            'description' => 'Updated description.',
            'status' => 'pending',
        ]);
    }

    public function test_actual_vote_row_blocks_edit_even_when_cached_vote_count_is_zero(): void
    {
        $owner = User::factory()->create();
        $voter = User::factory()->create();
        $gem = Location::factory()->for($owner)->create([
            'status' => 'pending_community_vote',
            'vote_count' => 0,
        ]);
        Vote::create([
            'user_id' => $voter->id,
            'location_id' => $gem->id,
            'travel_description' => 'Worth visiting.',
        ]);
        $original = $gem->only([
            'category_id', 'place_name', 'address', 'state', 'postcode',
            'description', 'latitude', 'longitude', 'status',
        ]);

        Sanctum::actingAs($owner);

        $this->putJson("/api/hidden-gems/{$gem->id}", $this->updatePayload($gem, [
            'place_name' => 'Must Not Change',
            'description' => 'Must not change either.',
        ]))
            ->assertForbidden()
            ->assertJsonPath('message', 'This Hidden Gem can no longer be edited because voting has started.');

        $fresh = $gem->fresh();
        foreach ($original as $field => $value) {
            $this->assertEquals($value, $fresh->{$field}, "The {$field} field changed after a rejected edit.");
        }
    }

    public function test_verified_hidden_gem_owner_can_only_edit_contact_fields(): void
    {
        Bus::fake([VerifyHiddenGemSubmission::class]);

        $owner = User::factory()->create();
        $gem = Location::factory()->for($owner)->create([
            'status' => 'hidden_gem',
            'place_name' => 'Original Name',
        ]);

        Sanctum::actingAs($owner);

        // Full payload — only the contact fields take; identity is ignored.
        $this->putJson("/api/hidden-gems/{$gem->id}", $this->updatePayload($gem, [
            'place_name' => 'Renamed Somehow',
            'phone' => '012-345 6789',
        ]))
            ->assertOk()
            ->assertJsonPath('message', 'Contact information updated.');

        $gem->refresh();
        $this->assertSame('Original Name', $gem->place_name);
        $this->assertSame('012-345 6789', $gem->phone);
        $this->assertSame('hidden_gem', $gem->status);
        Bus::assertNotDispatched(VerifyHiddenGemSubmission::class);
    }

    public function test_non_owner_cannot_edit_a_hidden_gem(): void
    {
        $owner = User::factory()->create();
        $otherUser = User::factory()->create();
        $gem = Location::factory()->for($owner)->create();

        Sanctum::actingAs($otherUser);

        $this->putJson("/api/hidden-gems/{$gem->id}", $this->updatePayload($gem))
            ->assertForbidden()
            ->assertJsonPath('message', 'Unauthorized');
    }

    public function test_verified_gem_with_a_vote_cannot_be_deleted(): void
    {
        $owner = User::factory()->create();
        $voter = User::factory()->create();
        $gem = Location::factory()->for($owner)->create([
            'status' => 'hidden_gem',
            'vote_count' => 1,
        ]);
        Vote::create([
            'user_id' => $voter->id,
            'location_id' => $gem->id,
        ]);

        Sanctum::actingAs($owner);

        $this->patchJson("/api/hidden-gems/{$gem->id}/status", ['status' => 'deleted'])
            ->assertForbidden()
            ->assertJsonPath('message', 'Verified Hidden Gems can no longer be deleted.');

        $this->assertDatabaseHas('locations', [
            'id' => $gem->id,
            'status' => 'hidden_gem',
        ]);
        $this->assertDatabaseHas('votes', [
            'location_id' => $gem->id,
            'user_id' => $voter->id,
        ]);
    }

    private function updatePayload(Location $gem, array $overrides = []): array
    {
        return array_merge([
            'category_id' => $gem->category_id,
            'place_name' => $gem->place_name,
            'address' => $gem->address,
            'state' => $gem->state,
            'postcode' => str_pad((string) $gem->postcode, 5, '0', STR_PAD_LEFT),
            'description' => $gem->description,
            'latitude' => $gem->latitude,
            'longitude' => $gem->longitude,
        ], $overrides);
    }
}
