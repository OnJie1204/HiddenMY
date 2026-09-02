<?php

namespace App\Http\Controllers;

use App\Models\Location;
use App\Models\Vote;
use App\Models\CheckIn;
use App\Support\Geo;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class VoteController extends Controller
{
    // Maximum allowed distance for location verification in kilometres
    private const MAX_CHECKIN_DISTANCE = 5.0;

    /**
     * Check whether the authenticated user is eligible to vote
     * for the selected Pending Hidden Gem.
     */
    public function checkEligibility($locationId)
    {
        $user = Auth::user();

        // User must be authenticated before voting
        if (!$user) {
            return response()->json([
                'eligible' => false,
                'message' => 'Please login first'
            ], 401);
        }

        $location = Location::findOrFail($locationId);

        // Prevent users from voting for their own Hidden Gem
        if ($location->user_id === $user->id) {
            return response()->json([
                'eligible' => false,
                'message' => 'You cannot vote for your own hidden gem'
            ]);
        }

        // Voting is only available for Pending Hidden Gems
        if ($location->status !== 'pending_community_vote') {
            return response()->json([
                'eligible' => false,
                'message' => $this->notVotableMessage($location->status)
            ]);
        }

        // Prevent duplicate voting by the same user
        $existingVote = Vote::where('user_id', $user->id)
            ->where('location_id', $locationId)
            ->first();

        if ($existingVote) {
            return response()->json([
                'eligible' => false,
                'message' => 'You have already voted for this location'
            ]);
        }

        // Check whether the user has previously verified this location
        $hasCheckIn = CheckIn::where('user_id', $user->id)
            ->where('location_id', $locationId)
            ->exists();

        return response()->json([
            'eligible' => true,
            'user_id' => $user->id,
            'has_check_in' => $hasCheckIn,
            'message' => $hasCheckIn
                ? 'You can vote!'
                : 'Please check-in at this location first',
            'location' => $location
        ]);
    }

    /**
     * Submit a vote for a Pending Hidden Gem.
     */
    public function store(Request $request, $locationId)
    {
        $user = Auth::user();

        // User must be authenticated before submitting a vote
        if (!$user) {
            return response()->json([
                'message' => 'Please login first'
            ], 401);
        }

        $location = Location::findOrFail($locationId);

        // Prevent users from voting for their own Hidden Gem
        if ($location->user_id === $user->id) {
            return response()->json([
                'message' => 'You cannot vote for your own hidden gem'
            ], 403);
        }

        // Only Pending Hidden Gems can receive community votes
        if ($location->status !== 'pending_community_vote') {
            return response()->json([
                'message' => $this->notVotableMessage($location->status)
            ], 400);
        }

        // Prevent duplicate votes
        $existingVote = Vote::where('user_id', $user->id)
            ->where('location_id', $locationId)
            ->first();

        if ($existingVote) {
            return response()->json([
                'message' => 'You have already voted for this location'
            ], 400);
        }

        /*
         * Require a recent successful location verification.
         *
         * The check-in must belong to the same user and Hidden Gem
         * and must have been verified within the last five minutes.
         */
        $recentCheckIn = CheckIn::where('user_id', $user->id)
            ->where('location_id', $locationId)
            ->where('check_in_at', '>=', now()->subMinutes(5))
            ->latest('check_in_at')
            ->first();

        if (!$recentCheckIn) {
            return response()->json([
                'message' => 'Please verify your current location before voting.'
            ], 403);
        }

        // Create the vote record
        $vote = Vote::create([
            'user_id' => $user->id,
            'location_id' => $locationId,
        ]);

        // Increase the community voting progress
        $location->increment('vote_count');

        /*
         * Automatically verify the Hidden Gem when the required
         * community voting threshold has been reached.
         */
        $threshold = $location->verification_threshold ?? 10;

        if ($location->vote_count >= $threshold) {
            $location->update([
                'status' => 'hidden_gem'
            ]);
        }

        return response()->json([
            'message' => 'Vote submitted successfully!',
            'vote' => $vote,
            'location' => $location->fresh(),
            'is_verified' => $location->status === 'hidden_gem'
        ], 201);
    }

    /**
     * Return an appropriate message when a location cannot be voted on.
     */
    private function notVotableMessage(string $status): string
    {
        return match ($status) {
            'hidden_gem' =>
                'This location is already a recognized Hidden Gem.',

            'ai_rejected' =>
                'This location did not pass AI verification and is not open for voting.',

            default =>
                'This location has not yet passed AI verification, so it cannot be voted on.',
        };
    }

    /**
     * Get all votes submitted for a specific Hidden Gem.
     */
    public function getVotes($locationId)
    {
        $votes = Vote::with('user:id,name,avatar_url')
            ->where('location_id', $locationId)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'data' => $votes
        ]);
    }

    /**
     * Get the voting history of the authenticated user.
     */
    public function myVotes()
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json([
                'message' => 'Please login first'
            ], 401);
        }

        $votes = Vote::with('location:id,place_name')
            ->where('user_id', $user->id)
            ->orderBy('created_at', 'desc')
            ->get([
                'id',
                'user_id',
                'location_id',
                'created_at',
                'updated_at',
            ]);

        return response()->json([
            'data' => $votes
        ]);
    }

    /**
     * Verify the user's submitted GPS location before voting.
     */
    public function checkIn(Request $request, $locationId)
    {
        $user = Auth::user();

        // User must be authenticated before location verification
        if (!$user) {
            return response()->json([
                'message' => 'Please login first'
            ], 401);
        }

        $location = Location::findOrFail($locationId);

        /*
         * Find an existing check-in for the same user and Hidden Gem.
         * It will be updated after successful location verification.
         */
        $existingCheckIn = CheckIn::where('user_id', $user->id)
            ->where('location_id', $locationId)
            ->first();

        $userLat = $request->input('latitude');
        $userLng = $request->input('longitude');

        // Latitude and longitude are required for verification
        if (!$userLat || !$userLng) {
            return response()->json([
                'message' => 'Please provide your location to check in'
            ], 400);
        }

        /*
         * Calculate the distance between the submitted GPS coordinates
         * and the coordinates of the selected Hidden Gem.
         */
        $distance = $this->calculateDistance(
            (float) $userLat,
            (float) $userLng,
            (float) $location->latitude,
            (float) $location->longitude
        );

        // Reject the location when it is outside the allowed 5 km radius
        if ($distance > self::MAX_CHECKIN_DISTANCE) {
            return response()->json([
                'message' =>
                    'You are '
                    . round($distance, 2)
                    . ' km away. You must be within '
                    . self::MAX_CHECKIN_DISTANCE
                    . ' km to check in.',

                'distance' => round($distance, 2),
                'max_distance' => self::MAX_CHECKIN_DISTANCE
            ], 400);
        }

        /*
         * Update an existing check-in or create a new one.
         *
         * check_in_at is refreshed every time the location is
         * successfully verified so the voting process can enforce
         * the recent five-minute verification requirement.
         */
        if ($existingCheckIn) {
            $existingCheckIn->update([
                'latitude' => $userLat,
                'longitude' => $userLng,
                'check_in_at' => now(),
            ]);

            $checkIn = $existingCheckIn->fresh();
        } else {
            $checkIn = CheckIn::create([
                'user_id' => $user->id,
                'location_id' => $locationId,
                'latitude' => $userLat,
                'longitude' => $userLng,
                'check_in_at' => now(),
            ]);
        }

        return response()->json([
            'message' =>
                'Check-in successful! You are '
                . round($distance, 2)
                . ' km away.',

            'checked_in' => true,
            'distance' => round($distance, 2),
            'max_distance' => self::MAX_CHECKIN_DISTANCE,
            'check_in' => $checkIn
        ]);
    }

    /**
     * Calculate the distance between two geographical coordinates.
     *
     * Geo::distanceMeters() returns metres, so the result
     * is converted to kilometres for the voting requirement.
     */
    private function calculateDistance($lat1, $lon1, $lat2, $lon2)
    {
        return Geo::distanceMeters(
            $lat1,
            $lon1,
            $lat2,
            $lon2
        ) / 1000;
    }
}