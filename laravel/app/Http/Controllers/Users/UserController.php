<?php

namespace App\Http\Controllers\Users;

use App\Http\Controllers\Controller;

use App\Models\User;
use App\Services\SpecialAchievementService;
use Illuminate\Http\Request;

class UserController extends Controller
{
    public function __construct(
        private readonly SpecialAchievementService $specialAchievements
    ) {}

    public function show($id)
    {
        $user = User::with(['locations' => function ($query) {
            $query->select([
                      'id',
                      'user_id',
                      'category_id',
                      'place_name',
                      'state',
                      'status',
                      'vote_count',
                      'verification_threshold',
                  ])
                  ->with([
                      'category:id,name',
                      'images:id,location_id,image_url',
                  ])
                  ->publiclyVisible()
                  ->orderBy('created_at', 'desc');
        }])->findOrFail($id);

        $activeFavourites = $this->specialAchievements
            ->activeFavouritesForUsers([$user->id])
            ->get($user->id, []);

        return response()->json([
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'avatar_url' => $user->avatar_url,
                'created_at' => $user->created_at,
                'favourite_achievements' => $activeFavourites,
            ],
            'gems' => $user->locations->map(function ($location) {
                return [
                    'id' => $location->id,
                    'place_name' => $location->place_name,
                    'state' => $location->state,
                    'status' => $location->status,
                    'vote_count' => $location->vote_count,
                    'verification_threshold' => $location->verification_threshold,
                    'category' => $location->category ? ['name' => $location->category->name] : null,
                    'images' => $location->images->map(function ($image) {
                        return ['image_url' => $image->image_url];
                    })->toArray(),
                ];
            }),
        ]);
    }
}
