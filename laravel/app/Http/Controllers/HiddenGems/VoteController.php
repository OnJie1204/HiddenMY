<?php

namespace App\Http\Controllers\HiddenGems;

use App\Http\Controllers\Controller;
use App\Models\CheckIn;
use App\Models\Location;
use App\Models\User;
use App\Models\Vote;
use App\Services\Achievements\SpecialAchievementService;
use App\Support\Geo;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class VoteController extends Controller
{
    public function __construct(
        private readonly SpecialAchievementService $achievements
    ) {}

    /**
     * Two location models coexist here:
     *  - Voting: coordinates are submitted with the vote and checked inline
     *    (store()), no record kept.
     *  - checkIn(): a persistent check_ins row (GPS-verified presence) that
     *    the reporting flow, the "verified visitor" story badge and the
     *    established-account gate all read.
     * Both use the same 5 km radius.
     */
    private const MAX_VOTE_DISTANCE = 5.0;

    private const MAX_CHECKIN_DISTANCE = 5.0;

    /**
     * Check whether the authenticated user is eligible to vote
     * for the selected Pending Hidden Gem.
     */
    public function checkEligibility($locationId)
    {
        $user = Auth::user();

        if (! $user) {
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

        // A gem confirmed permanently closed while still in voting is frozen.
        if (! $location->acceptsNewInteractions()) {
            return response()->json([
                'eligible' => false,
                'message' => Location::FROZEN_MESSAGE,
            ]);
        }

        // Prevent duplicate voting by the same user
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

        if (! $user) {
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

        // A gem confirmed permanently closed while still in voting is frozen.
        if (! $location->acceptsNewInteractions()) {
            return response()->json(['message' => Location::FROZEN_MESSAGE], 400);
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
            $becameHiddenGem = false;

            if ($location->vote_count >= $threshold) {
                $location->update([
                    'status' => 'hidden_gem',
                ]);
                $becameHiddenGem = true;
            }

            return [
                'error' => false,
                'vote' => $vote,
                'location' => $location->fresh(),
                'became_hidden_gem' => $becameHiddenGem,
            ];
        });

        if ($result['error']) {
            return response()->json([
                'message' => $result['message'],
            ], $result['status']);
        }

        // The vote is already committed. Achievement reconciliation is
        // deliberately failure-isolated so it cannot roll back or fail the
        // community action that triggered it.
        try {
            $this->achievements->sync($user->fresh());

            if ($result['became_hidden_gem']) {
                $owner = User::find($result['location']->user_id);
                if ($owner) {
                    $this->achievements->sync($owner);
                }
            }
        } catch (\Throwable $exception) {
            report($exception);
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
            'hidden_gem' => 'This location is already a recognized Hidden Gem.',

            'ai_rejected' => 'This location did not pass AI verification and is not open for voting.',

            default => 'This location has not yet passed AI verification, so it cannot be voted on.',
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

        if (! $user) {
            return response()->json([
                'message' => 'Please login first',
            ], 401);
        }

        $votes = Vote::with([
            'location:id,place_name,status',
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
            ->map(function (Vote $vote) {
                $locationAvailable = $vote->location !== null
                    && ! $vote->location->isDeleted()
                    && ! $vote->location->isArchived();

                return [
                    'id' => $vote->id,
                    'user_id' => $vote->user_id,
                    'location_id' => $vote->location_id,
                    'created_at' => $vote->created_at,
                    'updated_at' => $vote->updated_at,
                    'location_available' => $locationAvailable,
                    'location' => $locationAvailable ? [
                        'id' => $vote->location->id,
                        'place_name' => $vote->location->place_name,
                        'first_image' => $vote->location->firstImage ? [
                            'image_url' => $vote->location->firstImage->image_url,
                        ] : null,
                    ] : null,
                ];
            });

        return response()->json([
            'data' => $votes,
        ]);
    }

    /**
     * Record a GPS-verified check-in at a hidden gem. Separate from voting
     * (which sends coordinates inline): a check_ins row is persistent proof
     * of physical presence, read by the reporting flow, the "verified
     * visitor" story badge and the established-account gate.
     */
    public function checkIn(Request $request, $locationId)
    {
        $user = Auth::user();

        // User must be authenticated before location verification
        if (! $user) {
            return response()->json([
                'message' => 'Please login first',
            ], 401);
        }

        $location = Location::findOrFail($locationId);

        if (! $location->acceptsNewInteractions()) {
            return response()->json(['message' => Location::FROZEN_MESSAGE], 403);
        }

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
        if (! $userLat || ! $userLng) {
            return response()->json([
                'message' => 'Please provide your location to check in',
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
                'message' => 'You are '
                    .round($distance, 2)
                    .' km away. You must be within '
                    .self::MAX_CHECKIN_DISTANCE
                    .' km to check in.',

                'distance' => round($distance, 2),
                'max_distance' => self::MAX_CHECKIN_DISTANCE,
            ], 400);
        }

        /*
         * Update an existing check-in or create a new one. check_in_at is
         * refreshed on every successful verification so callers that care
         * about recency can look at it.
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
            'message' => 'Check-in successful! You are '
                .round($distance, 2)
                .' km away.',

            'checked_in' => true,
            'distance' => round($distance, 2),
            'max_distance' => self::MAX_CHECKIN_DISTANCE,
            'check_in' => $checkIn,
        ]);
    }

    /**
     * Calculate the distance between two geographical coordinates.
     *
     * Geo::distanceMeters() returns metres, so the result
     * is converted to kilometres for the 5 km radius checks.
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
