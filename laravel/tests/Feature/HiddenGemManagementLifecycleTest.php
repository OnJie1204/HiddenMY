<?php

namespace Tests\Feature;

use App\Jobs\VerifyHiddenGemSubmission;
use App\Models\Location;
use App\Models\Report;
use App\Models\User;
use App\Models\Vote;
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
            Bus::assertDispatched(VerifyHiddenGemSubmission::class, fn ($job) => true);
        }
    }

    public function test_contact_edit_unlocked_owner_updates_contact_fields_only_without_touching_verification(): void
    {
        Bus::fake([VerifyHiddenGemSubmission::class]);
        $owner = User::factory()->create();
        $voter = User::factory()->create();
        $gem = Location::factory()->for($owner)->create([
            'status' => 'hidden_gem',
            'contact_edit_unlocked_at' => now(),
            'vote_count' => 12,
            'phone' => '011-000 0000',
            'description' => 'Original description.',
        ]);
        $vote = Vote::create(['user_id' => $voter->id, 'location_id' => $gem->id]);
        $report = Report::create([
            'user_id' => $voter->id,
            'location_id' => $gem->id,
            'reason' => 'inappropriate_content',
            'status' => 'upheld',
            'suggested_phone' => '012-345 6789',
            'resolved_at' => now(),
        ]);

        Sanctum::actingAs($owner);

        $this->getJson("/api/hidden-gems/{$gem->id}")
            ->assertOk()
            ->assertJsonPath('data.can_edit', true)
            ->assertJsonPath('data.can_delete', false)
            ->assertJsonPath('data.edit_mode', 'contact_only')
            ->assertJsonPath('data.contact_edit_context.suggested_phone', '012-345 6789');

        $this->putJson("/api/hidden-gems/{$gem->id}", [
            'opening_hours' => '9am - 6pm daily',
            'phone' => '012-345 6789',
            'website' => 'https://example.com',
            // These must be ignored in contact-only mode.
            'description' => 'Attempted description hijack.',
            'status' => 'pending',
        ])
            ->assertOk()
            ->assertJsonPath('message', 'Contact information updated.');

        $gem->refresh();
        $this->assertSame('hidden_gem', $gem->status);
        $this->assertNull($gem->contact_edit_unlocked_at);
        $this->assertSame(12, $gem->vote_count);
        $this->assertSame('Original description.', $gem->description);
        $this->assertSame('012-345 6789', $gem->phone);
        $this->assertSame('9am - 6pm daily', $gem->opening_hours);
        $this->assertDatabaseHas('votes', ['id' => $vote->id, 'location_id' => $gem->id]);
        $this->assertDatabaseHas('reports', ['id' => $report->id, 'status' => 'upheld']);
        Bus::assertNotDispatched(VerifyHiddenGemSubmission::class);
    }

    public function test_permanently_closed_voting_gem_owner_can_resubmit_and_delete(): void
    {
        Bus::fake([VerifyHiddenGemSubmission::class]);
        $owner = User::factory()->create();
        $voter = User::factory()->create();
        Sanctum::actingAs($owner);

        $closed = Location::factory()->for($owner)->create([
            'status' => 'pending_community_vote',
            'permanently_closed_at' => now()->subDay(),
            'vote_count' => 6,
        ]);
        Vote::create(['user_id' => $voter->id, 'location_id' => $closed->id]);

        $this->getJson("/api/hidden-gems/{$closed->id}")
            ->assertOk()
            ->assertJsonPath('data.can_edit', true)
            ->assertJsonPath('data.can_delete', true)
            ->assertJsonPath('data.edit_mode', 'normal');

        // Editing is a full resubmit, even though it has votes.
        $this->putJson("/api/hidden-gems/{$closed->id}", $this->updatePayload($closed, [
            'description' => 'It has reopened under new owners.',
        ]))->assertOk();

        $closed->refresh();
        $this->assertSame('pending', $closed->status);
        $this->assertNull($closed->permanently_closed_at);
        $this->assertSame(0, $closed->vote_count);
        Bus::assertDispatched(VerifyHiddenGemSubmission::class);

        $another = Location::factory()->for($owner)->create([
            'status' => 'pending_community_vote',
            'permanently_closed_at' => now(),
        ]);
        $this->patchJson("/api/hidden-gems/{$another->id}/status", ['status' => 'deleted'])
            ->assertOk();
        $this->assertSame('deleted', $another->fresh()->status);
    }

    public function test_permanently_closed_verified_gem_is_frozen_for_the_owner(): void
    {
        $owner = User::factory()->create();
        Sanctum::actingAs($owner);

        $closed = Location::factory()->for($owner)->create([
            'status' => 'hidden_gem',
            'permanently_closed_at' => now(),
        ]);

        $this->getJson("/api/hidden-gems/{$closed->id}")
            ->assertOk()
            ->assertJsonPath('data.can_edit', false)
            ->assertJsonPath('data.can_delete', false)
            ->assertJsonPath('data.edit_mode', null);

        $this->putJson("/api/hidden-gems/{$closed->id}", $this->updatePayload($closed, [
            'description' => 'Trying to revive it.',
        ]))->assertForbidden()
            ->assertJsonPath('message', 'This gem is marked permanently closed and can no longer be edited or deleted.');

        $this->patchJson("/api/hidden-gems/{$closed->id}/status", ['status' => 'deleted'])
            ->assertForbidden();
        $this->assertSame('hidden_gem', $closed->fresh()->status);
    }

    public function test_confirmed_content_report_lets_voting_gem_owner_resubmit(): void
    {
        Bus::fake([VerifyHiddenGemSubmission::class]);
        $owner = User::factory()->create();
        $voter = User::factory()->create();
        Sanctum::actingAs($owner);

        // A gem still in community voting, with a confirmed inappropriate_content
        // report (contact_edit_unlocked_at set) and existing votes.
        $gem = Location::factory()->for($owner)->create([
            'status' => 'pending_community_vote',
            'contact_edit_unlocked_at' => now(),
            'vote_count' => 4,
        ]);
        Vote::create(['user_id' => $voter->id, 'location_id' => $gem->id]);
        Report::create([
            'user_id' => $voter->id,
            'location_id' => $gem->id,
            'reason' => 'inappropriate_content',
            'status' => 'upheld',
            'suggested_description' => 'The accurate description.',
            'resolved_at' => now(),
        ]);

        $this->getJson("/api/hidden-gems/{$gem->id}")
            ->assertOk()
            ->assertJsonPath('data.can_edit', true)
            ->assertJsonPath('data.can_delete', true)
            ->assertJsonPath('data.edit_mode', 'normal')
            ->assertJsonPath('data.suggested_fix.state', 'confirmed')
            ->assertJsonPath('data.suggested_fix.description', 'The accurate description.');

        // The owner's fix is a full resubmit.
        $this->putJson("/api/hidden-gems/{$gem->id}", $this->updatePayload($gem, [
            'description' => 'The accurate description.',
        ]))->assertOk();

        $gem->refresh();
        $this->assertSame('pending', $gem->status);
        $this->assertSame(0, $gem->vote_count);
        $this->assertNull($gem->contact_edit_unlocked_at);
        $this->assertDatabaseMissing('votes', ['location_id' => $gem->id]);
        Bus::assertDispatched(VerifyHiddenGemSubmission::class);
    }

    public function test_verified_gem_owner_can_always_edit_contact_info_without_re_verification(): void
    {
        Bus::fake([VerifyHiddenGemSubmission::class]);
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $voter = User::factory()->create();
        $gem = Location::factory()->for($owner)->create([
            'status' => 'hidden_gem',
            'vote_count' => 10,
            'description' => 'Original description.',
            'phone' => '011-000 0000',
        ]);
        Vote::create(['user_id' => $voter->id, 'location_id' => $gem->id]);

        Sanctum::actingAs($owner);

        $this->getJson("/api/hidden-gems/{$gem->id}")
            ->assertOk()
            ->assertJsonPath('data.can_edit', true)
            ->assertJsonPath('data.can_delete', false)
            ->assertJsonPath('data.edit_mode', 'contact_only');

        $this->putJson("/api/hidden-gems/{$gem->id}", [
            'opening_hours' => '10am - 8pm',
            'phone' => '012-345 6789',
            'website' => 'https://example.com',
            'description' => 'Attempted hijack.',
            'status' => 'pending',
        ])
            ->assertOk()
            ->assertJsonPath('message', 'Contact information updated.');

        $gem->refresh();
        $this->assertSame('hidden_gem', $gem->status);
        $this->assertSame(10, $gem->vote_count);
        $this->assertSame('Original description.', $gem->description);
        $this->assertSame('012-345 6789', $gem->phone);
        $this->assertSame('10am - 8pm', $gem->opening_hours);
        $this->assertDatabaseHas('votes', ['location_id' => $gem->id]);
        Bus::assertNotDispatched(VerifyHiddenGemSubmission::class);

        // Non-owner still can't touch it.
        Sanctum::actingAs($other);
        $this->putJson("/api/hidden-gems/{$gem->id}", ['phone' => '019-999 9999'])
            ->assertForbidden()
            ->assertJsonPath('message', 'Unauthorized');
    }

    public function test_verified_gem_contact_edit_is_locked_while_a_report_is_under_review(): void
    {
        $owner = User::factory()->create();
        $gem = Location::factory()->for($owner)->create([
            'status' => 'hidden_gem',
            'report_status' => 'under_review',
        ]);

        Sanctum::actingAs($owner);
        $this->getJson("/api/hidden-gems/{$gem->id}")
            ->assertOk()
            ->assertJsonPath('data.can_edit', false)
            ->assertJsonPath('data.edit_mode', null);

        $this->putJson("/api/hidden-gems/{$gem->id}", ['phone' => '012-000 0000'])
            ->assertForbidden()
            ->assertJsonPath('message', 'Verified Hidden Gems can no longer be edited.');
    }

    public function test_my_hidden_gems_exposes_authoritative_eligibility_and_excludes_deleted(): void
    {
        $owner = User::factory()->create();
        $voter = User::factory()->create();
        $pending = Location::factory()->for($owner)->create(['status' => 'pending']);
        $voting = Location::factory()->for($owner)->create([
            'status' => 'pending_community_vote',
            'vote_count' => 0,
        ]);
        Vote::create(['user_id' => $voter->id, 'location_id' => $voting->id]);
        $contactUnlocked = Location::factory()->for($owner)->create([
            'status' => 'hidden_gem',
            'contact_edit_unlocked_at' => now(),
        ]);
        Report::create([
            'user_id' => $voter->id,
            'location_id' => $contactUnlocked->id,
            'reason' => 'inappropriate_content',
            'status' => 'upheld',
        ]);
        $deleted = Location::factory()->for($owner)->create(['status' => 'deleted']);

        Sanctum::actingAs($owner);
        $data = $this->getJson('/api/my-hidden-gems')->assertOk()->json('data');
        $byId = collect($data)->keyBy('id');

        $this->assertTrue($byId[$pending->id]['can_edit']);
        $this->assertTrue($byId[$pending->id]['can_delete']);
        $this->assertSame('normal', $byId[$pending->id]['edit_mode']);
        $this->assertFalse($byId[$voting->id]['can_edit']);
        $this->assertFalse($byId[$voting->id]['can_delete']);
        $this->assertTrue($byId[$contactUnlocked->id]['can_edit']);
        $this->assertFalse($byId[$contactUnlocked->id]['can_delete']);
        $this->assertSame('contact_only', $byId[$contactUnlocked->id]['edit_mode']);
        $this->assertFalse($byId->has($deleted->id));
    }

    public function test_delete_uses_actual_vote_rows_and_remains_logical(): void
    {
        $owner = User::factory()->create();
        $voter = User::factory()->create();
        Sanctum::actingAs($owner);

        foreach (['pending', 'ai_rejected', 'pending_community_vote'] as $status) {
            $gem = Location::factory()->for($owner)->create(['status' => $status]);
            $this->patchJson("/api/hidden-gems/{$gem->id}/status", ['status' => 'deleted'])
                ->assertOk();
            $this->assertSame('deleted', $gem->fresh()->status);
            $this->assertDatabaseHas('locations', ['id' => $gem->id]);
        }

        $voting = Location::factory()->for($owner)->create([
            'status' => 'pending_community_vote',
            'vote_count' => 0,
        ]);
        $vote = Vote::create(['user_id' => $voter->id, 'location_id' => $voting->id]);
        $this->patchJson("/api/hidden-gems/{$voting->id}/status", ['status' => 'deleted'])
            ->assertForbidden()
            ->assertJsonPath('title', 'Deletion Unavailable');
        $this->assertSame('pending_community_vote', $voting->fresh()->status);
        $this->assertDatabaseHas('votes', ['id' => $vote->id]);

        foreach (['hidden_gem', 'delisted'] as $status) {
            $gem = Location::factory()->for($owner)->create(['status' => $status]);
            $this->patchJson("/api/hidden-gems/{$gem->id}/status", ['status' => 'deleted'])
                ->assertForbidden();
            $this->assertSame($status, $gem->fresh()->status);
        }

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
