<?php

namespace Tests\Feature;

use App\Models\Location;
use App\Models\TravelPost;
use App\Models\TripItinerary;
use App\Models\TripLocation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SharedTripItineraryTest extends TestCase
{
    use RefreshDatabase;

    private function tripWithStop(User $owner, string $gemStatus = 'hidden_gem'): array
    {
        $trip = TripItinerary::create(['user_id' => $owner->id, 'trip_name' => 'johor trip']);
        $gem = Location::factory()->create(['status' => $gemStatus, 'place_name' => 'Roadside Stall']);
        TripLocation::create([
            'trip_itinerary_id' => $trip->id,
            'location_id' => $gem->id,
            'isHidden' => true,
            'order_number' => 1,
        ]);

        return [$trip, $gem];
    }

    public function test_shared_itinerary_is_visible_to_others_only_when_attached_to_a_post(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        [$trip] = $this->tripWithStop($owner);

        Sanctum::actingAs($viewer);

        // Not attached to any post yet -> forbidden.
        $this->getJson("/api/trip-itineraries/{$trip->id}/shared")->assertForbidden();

        TravelPost::create([
            'user_id' => $owner->id,
            'trip_itinerary_id' => $trip->id,
            'title' => 'lok lok the best',
            'body' => 'great trip',
        ]);

        $this->getJson("/api/trip-itineraries/{$trip->id}/shared")
            ->assertOk()
            ->assertJsonPath('data.trip_name', 'johor trip')
            ->assertJsonPath('data.is_owner', false)
            ->assertJsonPath('data.can_copy', true)
            ->assertJsonPath('data.stops.0.name', 'Roadside Stall')
            ->assertJsonPath('data.stops.0.gem.is_visible', true);
    }

    public function test_shared_view_reflects_a_permanently_closed_gem_live(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        [$trip, $gem] = $this->tripWithStop($owner);
        TravelPost::create(['user_id' => $owner->id, 'trip_itinerary_id' => $trip->id, 'title' => 't', 'body' => 'b']);

        $gem->update(['permanently_closed_at' => now()]);

        Sanctum::actingAs($viewer);
        $this->getJson("/api/trip-itineraries/{$trip->id}/shared")
            ->assertOk()
            ->assertJsonPath('data.stops.0.gem.permanently_closed_at', $gem->fresh()->permanently_closed_at->toJSON());
    }

    public function test_copy_clones_the_itinerary_into_the_current_users_trips(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        [$trip, $gem] = $this->tripWithStop($owner);
        TravelPost::create(['user_id' => $owner->id, 'trip_itinerary_id' => $trip->id, 'title' => 't', 'body' => 'b']);

        Sanctum::actingAs($viewer);

        $newId = $this->postJson("/api/trip-itineraries/{$trip->id}/copy")
            ->assertCreated()
            ->assertJsonPath('message', 'Trip copied to your itineraries.')
            ->json('data.id');

        $this->assertNotSame($trip->id, $newId);
        $this->assertDatabaseHas('trip_itineraries', ['id' => $newId, 'user_id' => $viewer->id, 'trip_name' => 'johor trip']);
        $this->assertDatabaseHas('trip_locations', ['trip_itinerary_id' => $newId, 'location_id' => $gem->id, 'order_number' => 1]);

        // The copier now owns it and can open it in the editor.
        $this->getJson("/api/trip-itineraries/{$newId}")->assertOk();
    }

    public function test_copy_is_forbidden_for_an_unshared_itinerary(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        [$trip] = $this->tripWithStop($owner);

        Sanctum::actingAs($viewer);
        $this->postJson("/api/trip-itineraries/{$trip->id}/copy")->assertForbidden();
        $this->assertDatabaseCount('trip_itineraries', 1);
    }
}
