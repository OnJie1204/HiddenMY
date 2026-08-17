<?php

namespace App\Http\Controllers;

use App\Models\Location;
use App\Models\Vote;
use App\Models\CheckIn;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;

class VoteController extends Controller
{
    private const MAX_CHECKIN_DISTANCE = 5.0;

    public function checkEligibility($locationId)
    {
        $user = Auth::user();
        
        if (!$user) {
            return response()->json(['eligible' => false, 'message' => 'Please login first'], 401);
        }

        $location = Location::findOrFail($locationId);

        if ($location->user_id === $user->id) {
            return response()->json([
                'eligible' => false,
                'message' => 'You cannot vote for your own hidden gem'
            ]);
        }

        if ($location->status === 'verified') {
            return response()->json([
                'eligible' => false,
                'message' => 'This location is already verified'
            ]);
        }

        $existingVote = Vote::where('user_id', $user->id)
            ->where('location_id', $locationId)
            ->first();

        if ($existingVote) {
            return response()->json([
                'eligible' => false,
                'message' => 'You have already voted for this location'
            ]);
        }

        $hasCheckIn = CheckIn::where('user_id', $user->id)
            ->where('location_id', $locationId)
            ->exists();

        return response()->json([
            'eligible' => true,
            'has_check_in' => $hasCheckIn,
            'message' => $hasCheckIn ? 'You can vote!' : 'Please check-in at this location first',
            'location' => $location
        ]);
    }

    public function store(Request $request, $locationId)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['message' => 'Please login first'], 401);
        }

        $location = Location::findOrFail($locationId);

        $validated = $request->validate([
            'comment' => 'nullable|string|max:1000',
            'photo' => 'nullable|image|max:5120'
        ]);

        if ($location->user_id === $user->id) {
            return response()->json([
                'message' => 'You cannot vote for your own hidden gem'
            ], 403);
        }

        if ($location->status === 'verified') {
            return response()->json([
                'message' => 'This location is already verified'
            ], 400);
        }

        $existingVote = Vote::where('user_id', $user->id)
            ->where('location_id', $locationId)
            ->first();

        if ($existingVote) {
            return response()->json([
                'message' => 'You have already voted for this location'
            ], 400);
        }

        $hasCheckIn = CheckIn::where('user_id', $user->id)
            ->where('location_id', $locationId)
            ->exists();

        if (!$hasCheckIn) {
            return response()->json([
                'message' => 'Please check-in at this location first before voting'
            ], 400);
        }

        $photoPath = null;
        if ($request->hasFile('photo')) {
            $photo = $request->file('photo');
            $filename = time() . '_' . uniqid() . '.' . $photo->getClientOriginalExtension();
            $photoPath = $photo->storeAs('votes', $filename, 'public');
        }

        $vote = Vote::create([
            'user_id' => $user->id,
            'location_id' => $locationId,
            'travel_description' => $validated['comment'] ?? null,
            'photo_path' => $photoPath,
        ]);

        $location->increment('vote_count');

        $threshold = $location->verification_threshold ?? 10;
        if ($location->vote_count >= $threshold) {
            $location->update(['status' => 'verified']);
        }

        return response()->json([
            'message' => 'Vote submitted successfully!',
            'vote' => $vote,
            'location' => $location->fresh(),
            'is_verified' => $location->status === 'verified'
        ], 201);
    }

    public function getVotes($locationId)
    {
        $votes = Vote::with('user')
            ->where('location_id', $locationId)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['data' => $votes]);
    }

    public function checkIn(Request $request, $locationId)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['message' => 'Please login first'], 401);
        }

        $location = Location::findOrFail($locationId);

        $existingCheckIn = CheckIn::where('user_id', $user->id)
            ->where('location_id', $locationId)
            ->first();

        if ($existingCheckIn) {
            return response()->json([
                'checked_in' => true,
                'message' => 'You already checked in at this location',
                'check_in' => $existingCheckIn
            ]);
        }

        $userLat = $request->input('latitude');
        $userLng = $request->input('longitude');

        if (!$userLat || !$userLng) {
            return response()->json([
                'message' => 'Please provide your location to check in'
            ], 400);
        }

        $distance = $this->calculateDistance(
            (float) $userLat,
            (float) $userLng,
            (float) $location->latitude,
            (float) $location->longitude
        );

        if ($distance > self::MAX_CHECKIN_DISTANCE) {
            return response()->json([
                'message' => 'You are ' . round($distance, 2) . ' km away. You must be within ' . self::MAX_CHECKIN_DISTANCE . ' km to check in.',
                'distance' => round($distance, 2),
                'max_distance' => self::MAX_CHECKIN_DISTANCE
            ], 400);
        }

        $checkIn = CheckIn::create([
            'user_id' => $user->id,
            'location_id' => $locationId,
            'check_in_at' => now(),
        ]);

        return response()->json([
            'message' => 'Check-in successful! You are ' . round($distance, 2) . ' km away.',
            'checked_in' => true,
            'distance' => round($distance, 2),
            'check_in' => $checkIn
        ]);
    }

    private function calculateDistance($lat1, $lon1, $lat2, $lon2)
    {
        $earthRadius = 6371;

        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);

        $a = sin($dLat / 2) * sin($dLat / 2) +
             cos(deg2rad($lat1)) * cos(deg2rad($lat2)) *
             sin($dLon / 2) * sin($dLon / 2);

        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

        return $earthRadius * $c;
    }
}