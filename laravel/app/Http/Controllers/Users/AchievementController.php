<?php

namespace App\Http\Controllers\Users;

use App\Http\Controllers\Controller;

use App\Services\SpecialAchievementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AchievementController extends Controller
{
    public function sync(Request $request, SpecialAchievementService $achievements): JsonResponse
    {
        $data = $achievements->sync($request->user())->map(fn ($achievement) => [
            'key' => $achievement->achievement_key,
            'type' => $achievement->achievement_type,
            'earned_at' => $achievement->earned_at,
            'position' => $achievement->position,
        ]);

        return response()->json(['data' => $data]);
    }
}
