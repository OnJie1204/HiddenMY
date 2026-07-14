<?php

namespace App\Http\Controllers;

use App\Models\TripItinerary;
use Illuminate\Http\Request;

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
        $request->validate([
            'name' => 'required|string|max:255',
        ]);

        $itinerary = TripItinerary::create([
            'user_id' => $request->user()->id,
            'name' => $request->name,
        ]);

        return response()->json([
            'message' => 'Trip itinerary created successfully.',
            'data' => $itinerary,
        ], 201);
    }

    /**
     * Rename an itinerary.
     */
    public function update(Request $request, TripItinerary $tripItinerary)
    {
        if ($tripItinerary->user_id !== $request->user()->id) {
            return response()->json([
                'message' => 'Unauthorized.'
            ], 403);
        }

        $request->validate([
            'name' => 'required|string|max:255',
        ]);

        $tripItinerary->update([
            'name' => $request->name,
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
                'message' => 'Unauthorized.'
            ], 403);
        }

        $tripItinerary->delete();

        return response()->json([
            'message' => 'Trip itinerary deleted successfully.'
        ]);
    }
}