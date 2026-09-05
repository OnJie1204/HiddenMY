<?php

namespace Tests\Feature\HiddenGems;

use App\Jobs\HiddenGems\ReviewPendingLocationEdit;
use App\Jobs\HiddenGems\VerifyHiddenGemSubmission;
use App\Models\Location;
use App\Models\LocationPendingEdit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner edit modes (redesign spec §2):
 *   pending / ai_rejected      -> 'normal'      full resubmit, full AI re-run
 *   verified (vote/gem/known)  -> 'verified'    contact instant, description/photos AI-reviewed
 *   permanently_closed         -> 'delete_only' delete only, no edits
 */
class HiddenGemEditingTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_full_resubmit_on_pending_gem_reruns_verification(): void
    {
        Bus::fake([VerifyHiddenGemSubmission::class]);

        $owner = User::factory()->create();
        $gem = Location::factory()->for($owner)->create([
            'status' => 'pending',
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
            'status' => 'pending',
        ]);
        Bus::assertDispatched(VerifyHiddenGemSubmission::class);
    }

    public function test_verified_gem_owner_contact_edit_is_instant_and_clears_the_flag(): void
    {
        Bus::fake([VerifyHiddenGemSubmission::class, ReviewPendingLocationEdit::class]);

        $owner = User::factory()->create();
        $gem = Location::factory()->for($owner)->create([
            'status' => 'hidden_gem',
            'place_name' => 'Original Name',
            'contact_flagged_at' => now(),
        ]);

        Sanctum::actingAs($owner);

        $this->putJson("/api/hidden-gems/{$gem->id}", [
            'edit_type' => 'contact',
            'opening_hours' => '10am - 8pm',
            'phone' => '012-345 6789',
            'website' => 'https://example.com',
            // identity fields must be ignored in this mode
            'place_name' => 'Renamed Somehow',
        ])
            ->assertOk()
            ->assertJsonPath('message', 'Contact information updated.');

        $gem->refresh();
        $this->assertSame('Original Name', $gem->place_name);
        $this->assertSame('012-345 6789', $gem->phone);
        $this->assertSame('hidden_gem', $gem->status);
        $this->assertNull($gem->contact_flagged_at);
        Bus::assertNotDispatched(VerifyHiddenGemSubmission::class);
    }

    public function test_verified_gem_owner_content_edit_goes_through_ai_review(): void
    {
        Bus::fake([VerifyHiddenGemSubmission::class, ReviewPendingLocationEdit::class]);

        $owner = User::factory()->create();
        $gem = Location::factory()->for($owner)->create(['status' => 'hidden_gem']);

        Sanctum::actingAs($owner);

        $this->putJson("/api/hidden-gems/{$gem->id}", [
            'edit_type' => 'content',
            'description' => 'A richer, more accurate description of the place.',
        ])->assertOk();

        $this->assertDatabaseHas('location_pending_edits', [
            'location_id' => $gem->id,
            'user_id' => $owner->id,
            'status' => LocationPendingEdit::STATUS_PENDING,
        ]);
        // The live gem is untouched until the review applies it.
        $this->assertNotSame('A richer, more accurate description of the place.', $gem->fresh()->description);
        Bus::assertDispatched(ReviewPendingLocationEdit::class);
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

    public function test_verified_gem_cannot_be_deleted_by_its_owner(): void
    {
        $owner = User::factory()->create();
        $gem = Location::factory()->for($owner)->create(['status' => 'hidden_gem']);

        Sanctum::actingAs($owner);

        $this->patchJson("/api/hidden-gems/{$gem->id}/status", ['status' => 'deleted'])
            ->assertForbidden();

        $this->assertDatabaseHas('locations', [
            'id' => $gem->id,
            'status' => 'hidden_gem',
        ]);
    }

    public function test_permanently_closed_gem_is_delete_only(): void
    {
        $owner = User::factory()->create();
        $gem = Location::factory()->for($owner)->create([
            'status' => 'hidden_gem',
            'permanently_closed_at' => now(),
        ]);

        Sanctum::actingAs($owner);

        $this->putJson("/api/hidden-gems/{$gem->id}", ['edit_type' => 'contact', 'phone' => '012-000 0000'])
            ->assertForbidden();

        $this->patchJson("/api/hidden-gems/{$gem->id}/status", ['status' => 'deleted'])
            ->assertOk();
        $this->assertSame('deleted', $gem->fresh()->status);
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
