<?php

namespace App\Http\Controllers;

use App\Models\Location;
use App\Models\TripItinerary;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class TripItineraryController extends Controller
{
    /**
     * Display all itineraries of the logged-in user.
     */
    public function index(Request $request)
    {
        $itineraries = TripItinerary::where('user_id', $request->user()->id)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($itineraries);
    }

    /**
     * Create a new itinerary.
     */
    public function store(Request $request)
    {
        // Backend validation
        $validated = $request->validate([
            'trip_name' => [
                'required',
                'string',
                'min:1',
                'max:10',
            ],
        ]);

        // Create itinerary after validation passed
        $trip = TripItinerary::create([
            'user_id' => $request->user()->id,
            'trip_name' => $validated['trip_name'],
        ]);

        return response()->json([
            'message' => 'Trip itinerary created successfully',
            'data' => $trip,
        ], 201);
    }

    /**
     * Display one itinerary and its ordered stopping points.
     */
    public function show(Request $request, TripItinerary $tripItinerary)
    {
        if ($tripItinerary->user_id !== $request->user()->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        return response()->json([
            'data' => $tripItinerary->load('locations.location'),
        ]);
    }

    /**
     * Add either an approved Hidden Gem or an OpenStreetMap location as a stop.
     */
    public function storeLocation(Request $request, TripItinerary $tripItinerary)
    {
        if ($tripItinerary->user_id !== $request->user()->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $validated = $request->validate([
            'source' => ['required', 'in:database,openstreetmap'],
            'location_id' => ['nullable', 'integer'],
            'osm_id' => ['nullable', 'integer'],
            'osm_name' => ['nullable', 'string', 'max:255'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
        ]);

        if ($validated['source'] === 'database') {
            $request->validate(['location_id' => ['required', 'integer']]);

            $location = Location::query()
                ->hiddenGems()
                ->find($validated['location_id']);

            if (! $location) {
                return response()->json([
                    'message' => 'The selected location is not an approved Hidden Gem.',
                ], 422);
            }

            $attributes = [
                'location_id' => $location->id,
                'osm_id' => null,
                'isHidden' => true,
            ];
        } else {
            $request->validate([
                'osm_id' => ['required', 'integer'],
                'osm_name' => ['required', 'string', 'max:255'],
                'latitude' => ['required', 'numeric', 'between:-90,90'],
                'longitude' => ['required', 'numeric', 'between:-180,180'],
            ]);

            $attributes = [
                'location_id' => null,
                'osm_id' => $validated['osm_id'],
                'osm_name' => $validated['osm_name'],
                'latitude' => $validated['latitude'],
                'longitude' => $validated['longitude'],
                'isHidden' => false,
            ];
        }

        $tripLocation = DB::transaction(function () use ($tripItinerary, $attributes) {
            $nextOrderNumber = $tripItinerary->locations()->max('order_number') + 1;

            return $tripItinerary->locations()->create([
                ...$attributes,
                'order_number' => $nextOrderNumber,
            ]);
        });

        return response()->json([
            'message' => 'Stopping point added successfully.',
            'data' => $tripLocation->load('location'),
        ], 201);
    }

    /**
     * Persist the ordered list of stopping points for an itinerary.
     */
    public function updateLocationOrder(Request $request, TripItinerary $tripItinerary)
    {
        if ($tripItinerary->user_id !== $request->user()->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $locations = Validator::make($request->all(), [
            '*' => ['required', 'array'],
            '*.id' => ['required', 'integer', 'distinct'],
            '*.sequence' => ['required', 'integer', 'min:1', 'distinct'],
        ])->validate();

        DB::transaction(function () use ($locations, $tripItinerary) {
            $storedLocations = $tripItinerary->locations()
                ->lockForUpdate()
                ->get();

            $storedIds = $storedLocations->pluck('id')->sort()->values();
            $submittedIds = collect($locations)->pluck('id')->sort()->values();
            $submittedSequences = collect($locations)->pluck('sequence')->sort()->values();
            $expectedSequences = $storedLocations->isEmpty()
                ? collect()
                : collect(range(1, $storedLocations->count()));

            if ($storedIds->count() !== $submittedIds->count()
                || $storedIds->all() !== $submittedIds->all()
                || $submittedSequences->all() !== $expectedSequences->all()) {
                abort(422, 'The order must contain every stopping point exactly once.');
            }

            foreach ($locations as $location) {
                $tripItinerary->locations()
                    ->whereKey($location['id'])
                    ->update(['order_number' => $location['sequence']]);
            }
        });

        return response()->json([
            'message' => 'Stopping point order updated successfully.',
            'data' => $tripItinerary->fresh()->load('locations.location'),
        ]);
    }

    /**
     * Remove a single stopping point from an itinerary.
     */
    public function destroyLocation(Request $request, TripItinerary $tripItinerary, $location)
    {
        if ($tripItinerary->user_id !== $request->user()->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $tripLocation = $tripItinerary->locations()->find($location);

        if (! $tripLocation) {
            return response()->json(['message' => 'Stopping point not found.'], 404);
        }

        $tripLocation->delete();

        return response()->json([
            'message' => 'Stopping point removed successfully.',
            'data' => $tripItinerary->fresh()->load('locations.location'),
        ]);
    }

    /**
     * Rename an itinerary.
     */
    public function update(Request $request, TripItinerary $tripItinerary)
    {
        if ($tripItinerary->user_id !== $request->user()->id) {
            return response()->json([
                'message' => 'Unauthorized.',
            ], 403);
        }

        $request->validate([
            'trip_name' => 'required|string|max:50',
        ]);

        $tripItinerary->update([
            'trip_name' => $request->trip_name,
        ]);

        return response()->json([
            'message' => 'Trip itinerary updated successfully.',
            'data' => $tripItinerary,
        ]);
    }

    /**
     * Delete an itinerary.
     */
    public function destroy(Request $request, TripItinerary $tripItinerary)
    {
        if ($tripItinerary->user_id !== $request->user()->id) {
            return response()->json([
                'message' => 'Unauthorized.',
            ], 403);
        }

        $tripItinerary->delete();

        return response()->json([
            'message' => 'Trip itinerary deleted successfully.',
        ]);
    }
}
