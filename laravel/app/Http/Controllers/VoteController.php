<?php

namespace App\Http\Controllers;

use App\Models\Location;
use App\Models\Vote;
use App\Support\Geo;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class VoteController extends Controller
{
    private const MAX_VOTE_DISTANCE = 5.0;

    /**
     * Check whether the authenticated user is eligible to vote
     * for the selected Pending Hidden Gem.
     */
    public function checkEligibility($locationId)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json([
                'eligible' => false,
                'message' => 'Please login first',
            ], 401);
        }

        $location = Location::findOrFail($locationId);

        if ($location->user_id === $user->id) {
            return response()->json([
                'eligible' => false,
                'message' => 'You cannot vote for your own hidden gem',
            ], 403);
        }

        if ($location->status !== 'pending_community_vote') {
            return response()->json([
                'eligible' => false,
                'message' => $this->notVotableMessage($location->status),
            ], 400);
        }

        $existingVote = Vote::where('user_id', $user->id)
            ->where('location_id', $locationId)
            ->exists();

        if ($existingVote) {
            return response()->json([
                'eligible' => false,
                'message' => 'You have already voted for this location',
            ], 409);
        }

        return response()->json([
            'eligible' => true,
            'user_id' => $user->id,
            'message' => 'You are eligible to vote.',
            'location' => $location,
            'max_distance' => self::MAX_VOTE_DISTANCE,
        ]);
    }

    /**
     * Verify the user's current GPS location and submit the vote.
     */
    public function store(Request $request, $locationId)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json([
                'message' => 'Please login first',
            ], 401);
        }

        try {
            $validated = $request->validate([
                'latitude' => ['required', 'numeric', 'between:-90,90'],
                'longitude' => ['required', 'numeric', 'between:-180,180'],
            ]);
        } catch (ValidationException $exception) {
            return response()->json([
                'message' => 'A valid current location is required to vote.',
                'errors' => $exception->errors(),
            ], 422);
        }

        $location = Location::findOrFail($locationId);

        if ($location->user_id === $user->id) {
            return response()->json([
                'message' => 'You cannot vote for your own hidden gem',
            ], 403);
        }

        if ($location->status !== 'pending_community_vote') {
            return response()->json([
                'message' => $this->notVotableMessage($location->status),
            ], 400);
        }

        if ($location->latitude === null || $location->longitude === null) {
            return response()->json([
                'message' => 'This hidden gem does not have valid coordinates for location verification.',
            ], 422);
        }

        $distance = $this->calculateDistance(
            (float) $validated['latitude'],
            (float) $validated['longitude'],
            (float) $location->latitude,
            (float) $location->longitude
        );

        if ($distance > self::MAX_VOTE_DISTANCE) {
            return response()->json([
                'message' => 'You must be within 5 km of this hidden gem to vote.',
                'distance' => round($distance, 2),
                'max_distance' => self::MAX_VOTE_DISTANCE,
            ], 422);
        }

        $result = DB::transaction(function () use ($user, $locationId) {
            $location = Location::query()
                ->lockForUpdate()
                ->findOrFail($locationId);

            if ($location->status !== 'pending_community_vote') {
                return [
                    'error' => true,
                    'status' => 400,
                    'message' => $this->notVotableMessage($location->status),
                ];
            }

            if ($location->user_id === $user->id) {
                return [
                    'error' => true,
                    'status' => 403,
                    'message' => 'You cannot vote for your own hidden gem',
                ];
            }

            $existingVote = Vote::where('user_id', $user->id)
                ->where('location_id', $locationId)
                ->exists();

            if ($existingVote) {
                return [
                    'error' => true,
                    'status' => 409,
                    'message' => 'You have already voted for this location',
                ];
            }

            $vote = Vote::create([
                'user_id' => $user->id,
                'location_id' => $locationId,
            ]);

            $location->increment('vote_count');
            $location->refresh();

            $threshold = $location->verification_threshold ?? 10;

            if ($location->vote_count >= $threshold) {
                $location->update([
                    'status' => 'hidden_gem',
                ]);
            }

            return [
                'error' => false,
                'vote' => $vote,
                'location' => $location->fresh(),
            ];
        });

        if ($result['error']) {
            return response()->json([
                'message' => $result['message'],
            ], $result['status']);
        }

        return response()->json([
            'message' => 'Vote submitted successfully!',
            'vote' => $result['vote'],
            'location' => $result['location'],
            'distance' => round($distance, 2),
            'max_distance' => self::MAX_VOTE_DISTANCE,
            'is_verified' => $result['location']->status === 'hidden_gem',
        ], 201);
    }

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
            'data' => $votes,
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
                'message' => 'Please login first',
            ], 401);
        }

        $votes = Vote::with([
            'location:id,place_name',
            'location.firstImage' => fn ($query) => $query->select([
                'location_images.id',
                'location_images.location_id',
                'location_images.image_url',
            ]),
        ])
            ->where('user_id', $user->id)
            ->orderBy('created_at', 'desc')
            ->get([
                'id',
                'user_id',
                'location_id',
                'created_at',
                'updated_at',
            ])
            ->map(fn (Vote $vote) => [
                'id' => $vote->id,
                'user_id' => $vote->user_id,
                'location_id' => $vote->location_id,
                'created_at' => $vote->created_at,
                'updated_at' => $vote->updated_at,
                'location' => $vote->location ? [
                    'id' => $vote->location->id,
                    'place_name' => $vote->location->place_name,
                    'first_image' => $vote->location->firstImage ? [
                        'image_url' => $vote->location->firstImage->image_url,
                    ] : null,
                ] : null,
            ]);

        return response()->json([
            'data' => $votes,
        ]);
    }

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
