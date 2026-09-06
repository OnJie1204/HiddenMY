<?php

namespace Tests\Feature\Travel;

use App\Models\Location;
use App\Models\TripItinerary;
use App\Models\TripLocation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A travel post carries its own frozen trip snapshot (post_stops), seeded from
 * the author's tagged itineraries plus manual stops, and any reader can copy it
 * into a new itinerary of their own — deleted / permanently-closed gems skipped.
 */
class TravelPostSnapshotTest extends TestCase
{
    use RefreshDatabase;

    public function test_missing_travel_post_returns_a_controlled_not_found_response(): void
    {
        $this->getJson('/api/travel-posts/999999')
            ->assertNotFound()
            ->assertExactJson(['message' => 'Travel post not found.']);
    }

    private function itineraryWithGem(User $owner, Location $gem): TripItinerary
    {
        $trip = TripItinerary::create(['user_id' => $owner->id, 'trip_name' => 'jb']);
        TripLocation::create([
            'trip_itinerary_id' => $trip->id,
            'location_id' => $gem->id,
            'isHidden' => true,
            'order_number' => 1,
        ]);

        return $trip;
    }

    public function test_post_snapshot_is_seeded_from_a_tagged_itinerary(): void
    {
        $author = User::factory()->create();
        $gem = Location::factory()->create(['status' => 'hidden_gem', 'place_name' => 'Roadside Stall']);
        $trip = $this->itineraryWithGem($author, $gem);

        Sanctum::actingAs($author);

        $res = $this->postJson('/api/travel-posts', [
            'title' => 'A weekend in JB',
            'body' => 'Great food everywhere.',
            'itinerary_ids' => [$trip->id],
        ])->assertCreated();

        $res->assertJsonPath('data.stops.0.name', 'Roadside Stall');
        $res->assertJsonPath('data.stops.0.kind', 'gem');
        $res->assertJsonPath('data.stops.0.gem.id', $gem->id);

        $postId = $res->json('data.id');
        $this->assertDatabaseHas('post_stops', ['travel_post_id' => $postId, 'location_id' => $gem->id]);
        // Mirrored into post_locations for the gem-detail "Community Stories" list.
        $this->assertDatabaseHas('post_locations', ['travel_post_id' => $postId, 'location_id' => $gem->id]);
    }

    public function test_explicit_stops_win_and_non_taggable_gems_are_dropped(): void
    {
        $author = User::factory()->create();
        $liveGem = Location::factory()->create(['status' => 'hidden_gem']);
        $rejectedGem = Location::factory()->create(['status' => 'ai_rejected']);

        Sanctum::actingAs($author);

        $res = $this->postJson('/api/travel-posts', [
            'title' => 'Trip',
            'body' => 'b',
            'stops' => [
                ['location_id' => $rejectedGem->id, 'caption' => 'should vanish'],
                ['location_id' => $liveGem->id, 'caption' => 'keep me'],
                ['osm_name' => 'A viewpoint', 'latitude' => 3.1, 'longitude' => 101.6],
            ],
        ])->assertCreated();

        $stops = $res->json('data.stops');
        $this->assertCount(2, $stops);
        $this->assertSame($liveGem->id, $stops[0]['gem']['id']);
        $this->assertSame('keep me', $stops[0]['caption']);
        $this->assertSame('osm', $stops[1]['kind']);
        $this->assertSame('A viewpoint', $stops[1]['name']);
    }

    public function test_standalone_post_with_no_stops_is_allowed(): void
    {
        $author = User::factory()->create();
        Sanctum::actingAs($author);

        $this->postJson('/api/travel-posts', [
            'title' => 'Just my thoughts',
            'body' => 'No particular trip.',
        ])->assertCreated()->assertJsonPath('data.stops', []);
    }

    public function test_a_deleted_or_closed_gem_stop_survives_in_the_snapshot(): void
    {
        $author = User::factory()->create();
        $closed = Location::factory()->create(['status' => 'hidden_gem', 'place_name' => 'Shut Cafe']);
        $gone = Location::factory()->create(['status' => 'hidden_gem', 'place_name' => 'Gone Gem']);

        Sanctum::actingAs($author);
        $postId = $this->postJson('/api/travel-posts', [
            'title' => 't', 'body' => 'b',
            'stops' => [
                ['location_id' => $closed->id],
                ['location_id' => $gone->id],
            ],
        ])->assertCreated()->json('data.id');

        $closed->update(['permanently_closed_at' => now()]);
        $gone->update(['status' => 'deleted']); // app soft-delete — the row stays

        $res = $this->getJson("/api/travel-posts/{$postId}")->assertOk();
        $stops = collect($res->json('data.stops'));

        $closedStop = $stops->firstWhere('name', 'Shut Cafe');
        $this->assertNotNull($closedStop['gem']['permanently_closed_at']);

        $goneStop = $stops->firstWhere('name', 'Gone Gem');
        $this->assertTrue($goneStop['removed']);
        $this->assertNull($goneStop['gem']);
    }

    public function test_reader_can_copy_the_trip_skipping_unavailable_stops(): void
    {
        $author = User::factory()->create();
        $reader = User::factory()->create();
        $live = Location::factory()->create(['status' => 'hidden_gem', 'place_name' => 'Open Spot']);
        $closed = Location::factory()->create(['status' => 'hidden_gem', 'place_name' => 'Closed Spot']);

        Sanctum::actingAs($author);
        $postId = $this->postJson('/api/travel-posts', [
            'title' => 'Copy me', 'body' => 'b',
            'stops' => [
                ['location_id' => $live->id],
                ['location_id' => $closed->id],
                ['osm_name' => 'Lookout', 'latitude' => 3.2, 'longitude' => 101.7],
            ],
        ])->assertCreated()->json('data.id');

        $closed->update(['permanently_closed_at' => now()]);

        Sanctum::actingAs($reader);
        $res = $this->postJson("/api/travel-posts/{$postId}/copy-trip")->assertCreated();

        $newTripId = $res->json('data.id');
        $this->assertSame([$reader->id], [TripItinerary::find($newTripId)->user_id]);
        $this->assertDatabaseHas('trip_locations', ['trip_itinerary_id' => $newTripId, 'location_id' => $live->id, 'order_number' => 1]);
        $this->assertDatabaseHas('trip_locations', ['trip_itinerary_id' => $newTripId, 'osm_name' => 'Lookout', 'order_number' => 2]);
        $this->assertDatabaseMissing('trip_locations', ['trip_itinerary_id' => $newTripId, 'location_id' => $closed->id]);
        $this->assertContains('Closed Spot (permanently closed)', $res->json('skipped'));
    }

    public function test_copying_a_post_with_no_stops_is_rejected(): void
    {
        $author = User::factory()->create();
        $reader = User::factory()->create();

        Sanctum::actingAs($author);
        $postId = $this->postJson('/api/travel-posts', ['title' => 't', 'body' => 'b'])
            ->assertCreated()->json('data.id');

        Sanctum::actingAs($reader);
        $this->postJson("/api/travel-posts/{$postId}/copy-trip")->assertStatus(422);
    }

    public function test_update_replaces_the_snapshot(): void
    {
        $author = User::factory()->create();
        $gemA = Location::factory()->create(['status' => 'hidden_gem']);
        $gemB = Location::factory()->create(['status' => 'hidden_gem']);

        Sanctum::actingAs($author);
        $postId = $this->postJson('/api/travel-posts', [
            'title' => 't', 'body' => 'b',
            'stops' => [['location_id' => $gemA->id]],
        ])->assertCreated()->json('data.id');

        $this->putJson("/api/travel-posts/{$postId}", [
            'title' => 't2', 'body' => 'b2',
            'stops' => [['location_id' => $gemB->id]],
        ])->assertOk();

        $this->assertDatabaseMissing('post_stops', ['travel_post_id' => $postId, 'location_id' => $gemA->id]);
        $this->assertDatabaseHas('post_stops', ['travel_post_id' => $postId, 'location_id' => $gemB->id]);
        $this->assertDatabaseMissing('post_locations', ['travel_post_id' => $postId, 'location_id' => $gemA->id]);
    }
}
