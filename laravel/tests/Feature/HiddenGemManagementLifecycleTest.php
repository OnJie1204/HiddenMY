<?php

namespace Tests\Feature;

use App\Jobs\ReviewPendingLocationEdit;
use App\Jobs\VerifyHiddenGemSubmission;
use App\Models\Location;
use App\Models\LocationPendingEdit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class HiddenGemManagementLifecycleTest extends TestCase
{
    use RefreshDatabase;

    public function test_pending_and_ai_rejected_owner_edits_keep_normal_reverification_flow(): void
    {
        Bus::fake([VerifyHiddenGemSubmission::class]);
        $owner = User::factory()->create();
        Sanctum::actingAs($owner);

        foreach (['pending', 'ai_rejected'] as $status) {
            $gem = Location::factory()->for($owner)->create([
                'status' => $status,
                'vote_count' => 0,
            ]);

            $this->putJson("/api/hidden-gems/{$gem->id}", $this->updatePayload($gem, [
                'description' => "Updated {$status} description.",
            ]))->assertOk();

            $this->assertSame('pending', $gem->fresh()->status);
            Bus::assertDispatched(VerifyHiddenGemSubmission::class);
        }
    }

    public function test_verified_gem_owner_updates_contact_fields_instantly_and_clears_the_flag(): void
    {
        Bus::fake([VerifyHiddenGemSubmission::class, ReviewPendingLocationEdit::class]);
        $owner = User::factory()->create();
        $gem = Location::factory()->for($owner)->create([
            'status' => 'hidden_gem',
            'contact_flagged_at' => now(),
            'vote_count' => 12,
            'phone' => '011-000 0000',
            'description' => 'Original description.',
        ]);

        Sanctum::actingAs($owner);

        $this->getJson("/api/hidden-gems/{$gem->id}")
            ->assertOk()
            ->assertJsonPath('data.can_edit', true)
            ->assertJsonPath('data.can_delete', false)
            ->assertJsonPath('data.edit_mode', 'verified')
            ->assertJsonPath('data.contact_flagged', true);

        $this->putJson("/api/hidden-gems/{$gem->id}", [
            'edit_type' => 'contact',
            'opening_hours' => '9am - 6pm daily',
            'phone' => '012-345 6789',
            'website' => 'https://example.com',
            'description' => 'Attempted description hijack.',
        ])
            ->assertOk()
            ->assertJsonPath('message', 'Contact information updated.');

        $gem->refresh();
        $this->assertSame('hidden_gem', $gem->status);
        $this->assertNull($gem->contact_flagged_at);
        $this->assertSame(12, $gem->vote_count);
        $this->assertSame('Original description.', $gem->description);
        $this->assertSame('012-345 6789', $gem->phone);
        $this->assertSame('9am - 6pm daily', $gem->opening_hours);
        Bus::assertNotDispatched(VerifyHiddenGemSubmission::class);
    }

    public function test_verified_gem_owner_description_edit_is_queued_for_ai_review(): void
    {
        Bus::fake([VerifyHiddenGemSubmission::class, ReviewPendingLocationEdit::class]);
        $owner = User::factory()->create();
        $gem = Location::factory()->for($owner)->create([
            'status' => 'pending_community_vote',
            'description' => 'Original description.',
        ]);

        Sanctum::actingAs($owner);

        $this->putJson("/api/hidden-gems/{$gem->id}", [
            'edit_type' => 'content',
            'description' => 'The place has been renovated and now serves brunch.',
        ])->assertOk();

        $this->assertDatabaseHas('location_pending_edits', [
            'location_id' => $gem->id,
            'status' => LocationPendingEdit::STATUS_PENDING,
        ]);
        $this->assertSame('Original description.', $gem->fresh()->description);
        Bus::assertDispatched(ReviewPendingLocationEdit::class);

        // Only one pending edit per gem — a second submission supersedes the first.
        $this->putJson("/api/hidden-gems/{$gem->id}", [
            'edit_type' => 'content',
            'description' => 'Actually it now serves dinner too.',
        ])->assertOk();

        $this->assertSame(
            1,
            LocationPendingEdit::where('location_id', $gem->id)
                ->where('status', LocationPendingEdit::STATUS_PENDING)
                ->count()
        );
    }

    public function test_permanently_closed_gem_is_delete_only_for_the_owner(): void
    {
        Bus::fake([VerifyHiddenGemSubmission::class]);
        $owner = User::factory()->create();
        Sanctum::actingAs($owner);

        foreach (['pending_community_vote', 'hidden_gem'] as $status) {
            $closed = Location::factory()->for($owner)->create([
                'status' => $status,
                'permanently_closed_at' => now(),
            ]);

            $this->getJson("/api/hidden-gems/{$closed->id}")
                ->assertOk()
                ->assertJsonPath('data.can_edit', false)
                ->assertJsonPath('data.can_delete', true)
                ->assertJsonPath('data.edit_mode', 'delete_only');

            $this->putJson("/api/hidden-gems/{$closed->id}", $this->updatePayload($closed, [
                'description' => 'Trying to revive it.',
            ]))->assertForbidden();

            $this->patchJson("/api/hidden-gems/{$closed->id}/status", ['status' => 'deleted'])
                ->assertOk();
            $this->assertSame('deleted', $closed->fresh()->status);
        }

        Bus::assertNotDispatched(VerifyHiddenGemSubmission::class);
    }

    public function test_deleted_gem_is_invisible_even_to_its_owner(): void
    {
        $owner = User::factory()->create();
        $gem = Location::factory()->for($owner)->create(['status' => 'deleted']);

        Sanctum::actingAs($owner);
        $this->getJson("/api/hidden-gems/{$gem->id}")->assertNotFound();
    }

    public function test_my_hidden_gems_exposes_authoritative_eligibility_and_excludes_deleted(): void
    {
        $owner = User::factory()->create();
        $pending = Location::factory()->for($owner)->create(['status' => 'pending']);
        $voting = Location::factory()->for($owner)->create([
            'status' => 'pending_community_vote',
            'vote_count' => 0,
        ]);
        $verified = Location::factory()->for($owner)->create(['status' => 'hidden_gem']);
        $closed = Location::factory()->for($owner)->create([
            'status' => 'hidden_gem',
            'permanently_closed_at' => now(),
        ]);
        $deleted = Location::factory()->for($owner)->create(['status' => 'deleted']);

        Sanctum::actingAs($owner);
        $data = $this->getJson('/api/my-hidden-gems')->assertOk()->json('data');
        $byId = collect($data)->keyBy('id');

        $this->assertTrue($byId[$pending->id]['can_edit']);
        $this->assertTrue($byId[$pending->id]['can_delete']);
        $this->assertSame('normal', $byId[$pending->id]['edit_mode']);

        $this->assertTrue($byId[$voting->id]['can_edit']);
        $this->assertFalse($byId[$voting->id]['can_delete']);
        $this->assertSame('verified', $byId[$voting->id]['edit_mode']);

        $this->assertSame('verified', $byId[$verified->id]['edit_mode']);
        $this->assertFalse($byId[$verified->id]['can_delete']);

        $this->assertFalse($byId[$closed->id]['can_edit']);
        $this->assertTrue($byId[$closed->id]['can_delete']);
        $this->assertSame('delete_only', $byId[$closed->id]['edit_mode']);

        $this->assertFalse($byId->has($deleted->id));
    }

    public function test_delete_permissions_by_status(): void
    {
        $owner = User::factory()->create();
        Sanctum::actingAs($owner);

        // pending / ai_rejected — deletable
        foreach (['pending', 'ai_rejected'] as $status) {
            $gem = Location::factory()->for($owner)->create(['status' => $status]);
            $this->patchJson("/api/hidden-gems/{$gem->id}/status", ['status' => 'deleted'])
                ->assertOk();
            $this->assertSame('deleted', $gem->fresh()->status);
        }

        // verified — not deletable
        foreach (['pending_community_vote', 'hidden_gem', 'well_known'] as $status) {
            $gem = Location::factory()->for($owner)->create(['status' => $status]);
            $this->patchJson("/api/hidden-gems/{$gem->id}/status", ['status' => 'deleted'])
                ->assertForbidden()
                ->assertJsonPath('title', 'Deletion Unavailable');
            $this->assertSame($status, $gem->fresh()->status);
        }

        // not the owner
        $other = User::factory()->create();
        $ownedPending = Location::factory()->for($owner)->create(['status' => 'pending']);
        Sanctum::actingAs($other);
        $this->patchJson("/api/hidden-gems/{$ownedPending->id}/status", ['status' => 'deleted'])
            ->assertForbidden()
            ->assertJsonPath('message', 'Unauthorized');
        $this->assertSame('pending', $ownedPending->fresh()->status);
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
