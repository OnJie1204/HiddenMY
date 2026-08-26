<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;

class UserController extends Controller
{
    public function show($id)
    {
        $user = User::with(['locations' => function ($query) {
            $query->with(['category', 'images'])
                  ->whereIn('status', ['hidden_gem', 'pending_community_vote', 'ai_rejected'])
                  ->orderBy('created_at', 'desc');
        }])->findOrFail($id);

        return response()->json([
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'avatar_url' => $user->avatar_url,
                'created_at' => $user->created_at,
                'email_verified_at' => $user->email_verified_at,
            ],
            'gems' => $user->locations->map(function ($location) {
                return [
                    'id' => $location->id,
                    'place_name' => $location->place_name,
                    'state' => $location->state,
                    'address' => $location->address,
                    'description' => $location->description,
                    'latitude' => $location->latitude,
                    'longitude' => $location->longitude,
                    'status' => $location->status,
                    'vote_count' => $location->vote_count,
                    'verification_threshold' => $location->verification_threshold,
                    'category' => $location->category ? ['name' => $location->category->name] : null,
                    'images' => $location->images->map(function ($image) {
                        return ['image_url' => $image->image_url];
                    })->toArray(),
                    'created_at' => $location->created_at,
                ];
            }),
        ]);
    }
}