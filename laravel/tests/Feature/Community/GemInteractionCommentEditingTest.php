<?php

namespace Tests\Feature\Community;

use App\Models\GemInteraction;
use App\Models\Location;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class GemInteractionCommentEditingTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_owner_can_edit_before_72_hours(): void
    {
        [$owner, $location, $comment] = $this->createCommentAt(now()->subHours(71));

        $this->actingAs($owner)->putJson("/api/gem-interactions/comments/{$comment->id}", [
            'comment' => 'Updated comment',
            'rating' => 5,
        ])->assertOk();

        $this->assertDatabaseHas('gem_interactions', [
            'id' => $comment->id,
            'comment' => 'Updated comment',
            'rating' => 5,
        ]);
    }

    public function test_owner_can_edit_exactly_at_72_hour_boundary(): void
    {
        $createdAt = Carbon::parse('2026-01-01 00:00:00');
        [$owner, , $comment] = $this->createCommentAt($createdAt);
        Carbon::setTestNow($createdAt->copy()->addHours(72));

        $this->actingAs($owner)->putJson("/api/gem-interactions/comments/{$comment->id}", [
            'comment' => 'Boundary update',
            'rating' => 4,
        ])->assertOk();
    }

    public function test_expired_edit_is_rejected_and_original_content_is_unchanged(): void
    {
        [$owner, , $comment] = $this->createCommentAt(now()->subHours(72)->subSecond());

        $this->actingAs($owner)->putJson("/api/gem-interactions/comments/{$comment->id}", [
            'comment' => 'Should not persist',
            'rating' => 1,
        ])->assertForbidden()
            ->assertJsonPath('message', 'Comments can only be edited within 72 hours of posting.');

        $this->assertSame('Original comment', $comment->fresh()->comment);
        $this->assertSame(3, $comment->fresh()->rating);
    }

    public function test_non_owner_cannot_edit_comment(): void
    {
        [, , $comment] = $this->createCommentAt(now()->subHour());
        $otherUser = User::factory()->create();

        $this->actingAs($otherUser)->putJson("/api/gem-interactions/comments/{$comment->id}", [
            'comment' => 'Unauthorized update',
            'rating' => 5,
        ])->assertForbidden();

        $this->assertSame('Original comment', $comment->fresh()->comment);
    }

    public function test_recent_updated_at_does_not_extend_the_edit_window(): void
    {
        [$owner, , $comment] = $this->createCommentAt(now()->subDays(4), now());

        $this->actingAs($owner)->putJson("/api/gem-interactions/comments/{$comment->id}", [
            'comment' => 'Should not persist',
            'rating' => 5,
        ])->assertForbidden();

        $this->assertSame('Original comment', $comment->fresh()->comment);
    }

    public function test_existing_comment_post_cannot_bypass_expired_edit_window(): void
    {
        [$owner, $location, $comment] = $this->createCommentAt(now()->subDays(4));

        $this->actingAs($owner)->postJson("/api/gem-interactions/{$location->id}", [
            'type' => 'comment',
            'comment' => 'Bypass attempt',
            'rating' => 5,
        ])->assertForbidden();

        $this->assertSame('Original comment', $comment->fresh()->comment);
    }

    public function test_owner_can_delete_comment_after_72_hours(): void
    {
        [$owner, , $comment] = $this->createCommentAt(now()->subDays(4));

        $this->actingAs($owner)
            ->deleteJson("/api/gem-interactions/comments/{$comment->id}")
            ->assertOk();

        $this->assertDatabaseMissing('gem_interactions', ['id' => $comment->id]);
    }

    private function createCommentAt(Carbon $createdAt, ?Carbon $updatedAt = null): array
    {
        $owner = User::factory()->create();
        $location = Location::factory()->create();
        $comment = GemInteraction::create([
            'user_id' => $owner->id,
            'location_id' => $location->id,
            'type' => 'comment',
            'comment' => 'Original comment',
            'rating' => 3,
        ]);

        DB::table('gem_interactions')->where('id', $comment->id)->update([
            'created_at' => $createdAt,
            'updated_at' => $updatedAt ?? $createdAt,
        ]);

        return [$owner, $location, $comment->fresh()];
    }
}
