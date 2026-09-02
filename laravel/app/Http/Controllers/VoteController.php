<?php

namespace App\Http\Controllers;

use App\Models\Location;
use App\Models\Vote;
use App\Models\CheckIn;
use App\Support\Geo;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;

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

        if ($location->status !== 'pending_community_vote') {
            return response()->json([
                'eligible' => false,
                'message' => $this->notVotableMessage($location->status)
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
            'user_id' => $user->id,
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

        if ($location->status !== 'pending_community_vote') {
            return response()->json([
                'message' => $this->notVotableMessage($location->status)
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

        $photoPath = null;
        if ($request->hasFile('photo')) {
            $photo = $request->file('photo');
            $fileName = 'votes/' . uniqid() . '.' . $photo->getClientOriginalExtension();

            $response = Http::withHeaders([
                'Authorization' => 'Bearer ' . env('SUPABASE_KEY'),
                'apikey' => env('SUPABASE_KEY'),
                'Content-Type' => $photo->getMimeType(),
            ])->withBody(
                file_get_contents($photo->getRealPath()),
                $photo->getMimeType()
            )->post(
                env('SUPABASE_URL') . '/storage/v1/object/vote_photos/' . $fileName
            );

            if ($response->failed()) {
                return response()->json([
                    'message' => 'Failed to upload vote photo.',
                    'error' => $response->json()
                ], 500);
            }

            $photoPath = env('SUPABASE_URL')
                . '/storage/v1/object/public/vote_photos/'
                . $fileName;
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
            $location->update(['status' => 'hidden_gem']);
        }

        return response()->json([
            'message' => 'Vote submitted successfully!',
            'vote' => $vote,
            'location' => $location->fresh(),
            'is_verified' => $location->status === 'hidden_gem'
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

    public function getVotes($locationId)
    {
        $votes = Vote::with('user:id,name,avatar_url')
            ->where('location_id', $locationId)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['data' => $votes]);
    }

    public function myVotes()
    {
        $votes = Vote::with([
            'location:id,place_name',
            'location.firstImage' => fn ($query) => $query->select([
                'location_images.id',
                'location_images.location_id',
                'location_images.image_url',
            ]),
        ])
            ->where('user_id', Auth::id())
            ->orderBy('created_at', 'desc')
            ->get([
                'id',
                'user_id',
                'location_id',
                'created_at',
            ])
            ->map(fn (Vote $vote) => [
                'id' => $vote->id,
                'created_at' => $vote->created_at,
                'location' => $vote->location ? [
                    'id' => $vote->location->id,
                    'place_name' => $vote->location->place_name,
                    'first_image' => $vote->location->firstImage ? [
                        'image_url' => $vote->location->firstImage->image_url,
                    ] : null,
                ] : null,
            ]);

        return response()->json(['data' => $votes]);
    }

    public function updateComment(Request $request, Vote $vote)
    {
        if ($vote->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if (!$vote->isCommentEditable()) {
            return response()->json([
                'message' => 'Comments can only be edited within 72 hours of posting.',
            ], 403);
        }

        $validated = $request->validate([
            'comment' => 'required|string|max:1000',
        ]);

        $vote->update([
            'travel_description' => $validated['comment'],
        ]);

        return response()->json([
            'message' => 'Comment updated successfully.',
            'data' => $vote,
        ]);
    }

    public function deleteComment(Vote $vote)
    {
        if ($vote->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $vote->update(['travel_description' => null]);

        return response()->json([
            'message' => 'Comment deleted successfully.',
            'data' => $vote,
        ]);
    }

    public function deletePhoto(Vote $vote)
    {
        if ($vote->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $photoPath = $vote->photo_path;
        $publicPrefix = rtrim((string) env('SUPABASE_URL'), '/')
            . '/storage/v1/object/public/vote_photos/';

        if ($photoPath && str_starts_with($photoPath, $publicPrefix)) {
            $objectPath = substr($photoPath, strlen($publicPrefix));
            $decodedObjectPath = rawurldecode($objectPath);

            if (
                $objectPath !== ''
                && !str_starts_with($decodedObjectPath, '/')
                && !str_contains($decodedObjectPath, '..')
            ) {
                $response = Http::withHeaders([
                    'Authorization' => 'Bearer ' . env('SUPABASE_KEY'),
                    'apikey' => env('SUPABASE_KEY'),
                ])->delete(
                    rtrim((string) env('SUPABASE_URL'), '/')
                    . '/storage/v1/object/vote_photos/'
                    . $objectPath
                );

                if ($response->failed()) {
                    return response()->json([
                        'message' => 'Failed to delete vote photo.',
                        'error' => $response->json(),
                    ], 500);
                }
            }
        }

        $vote->update(['photo_path' => null]);

        return response()->json([
            'message' => 'Photo deleted successfully.',
            'data' => $vote,
        ]);
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
            'message' => 'Check-in successful! You are ' . round($distance, 2) . ' km away.',
            'checked_in' => true,
            'distance' => round($distance, 2),
            'max_distance' => self::MAX_CHECKIN_DISTANCE,
            'check_in' => $checkIn
        ]);
    }

    private function calculateDistance($lat1, $lon1, $lat2, $lon2)
    {
        return Geo::distanceMeters($lat1, $lon1, $lat2, $lon2) / 1000;
    }
}
