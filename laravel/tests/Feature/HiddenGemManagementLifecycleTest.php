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

    public function test_delisted_owner_can_save_repair_without_changing_moderation_or_verification_state(): void
    {
        Bus::fake([VerifyHiddenGemSubmission::class]);
        $owner = User::factory()->create();
        $voter = User::factory()->create();
        $gem = Location::factory()->for($owner)->create([
            'status' => 'delisted',
            'report_status' => 'upheld',
            'vote_count' => 7,
        ]);
        $vote = Vote::create(['user_id' => $voter->id, 'location_id' => $gem->id]);
        $report = Report::create([
            'user_id' => $voter->id,
            'location_id' => $gem->id,
            'reason' => 'inappropriate_content',
            'status' => 'upheld',
            'flagged_item' => 'description',
            'resolved_at' => now(),
        ]);

        Sanctum::actingAs($owner);

        $this->getJson("/api/hidden-gems/{$gem->id}")
            ->assertOk()
            ->assertJsonPath('data.can_edit', true)
            ->assertJsonPath('data.can_delete', false)
            ->assertJsonPath('data.edit_mode', 'repair')
            ->assertJsonPath('data.repair_context.reason', 'inappropriate_content')
            ->assertJsonPath('data.repair_context.flagged_item', 'description');

        $this->putJson("/api/hidden-gems/{$gem->id}", $this->updatePayload($gem, [
            'description' => 'Repaired owner description.',
        ]))
            ->assertOk()
            ->assertJsonPath('message', 'Changes saved. You can now request a Fix Review.');

        $gem->refresh();
        $this->assertSame('delisted', $gem->status);
        $this->assertSame('upheld', $gem->report_status);
        $this->assertSame(7, $gem->vote_count);
        $this->assertSame('Repaired owner description.', $gem->description);
        $this->assertDatabaseHas('votes', ['id' => $vote->id, 'location_id' => $gem->id]);
        $this->assertDatabaseHas('reports', ['id' => $report->id, 'status' => 'upheld']);
        Bus::assertNotDispatched(VerifyHiddenGemSubmission::class);
    }

    public function test_invalid_or_non_owner_delisted_repair_is_blocked(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $gem = Location::factory()->for($owner)->create([
            'status' => 'delisted',
            'report_status' => 'upheld',
        ]);

        Sanctum::actingAs($owner);
        $this->putJson("/api/hidden-gems/{$gem->id}", $this->updatePayload($gem))
            ->assertForbidden();

        Report::create([
            'user_id' => $other->id,
            'location_id' => $gem->id,
            'reason' => 'inappropriate_content',
            'status' => 'upheld',
        ]);

        Sanctum::actingAs($other);
        $this->putJson("/api/hidden-gems/{$gem->id}", $this->updatePayload($gem))
            ->assertForbidden()
            ->assertJsonPath('message', 'Unauthorized');
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
        $delisted = Location::factory()->for($owner)->create([
            'status' => 'delisted',
            'report_status' => 'upheld',
        ]);
        Report::create([
            'user_id' => $voter->id,
            'location_id' => $delisted->id,
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
        $this->assertTrue($byId[$delisted->id]['can_edit']);
        $this->assertFalse($byId[$delisted->id]['can_delete']);
        $this->assertSame('repair', $byId[$delisted->id]['edit_mode']);
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
