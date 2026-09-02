<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\UserFavouriteAchievement;
use App\Services\SpecialAchievementService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class FavouriteAchievementController extends Controller
{
    public function index(Request $request, SpecialAchievementService $achievements)
    {
        $data = $request->user()
            ->favouriteAchievements()
            ->get()
            ->filter(fn (UserFavouriteAchievement $favourite) => $achievements->isValidKey($favourite->achievement_key))
            ->map(fn (UserFavouriteAchievement $favourite) => [
                'key' => $favourite->achievement_key,
                'position' => $favourite->position,
            ])
            ->values();

        return response()->json(['data' => $data]);
    }

    public function update(Request $request, SpecialAchievementService $achievements)
    {
        $validated = $request->validate([
            'achievement_keys' => ['present', 'array', 'max:2'],
            'achievement_keys.*' => ['string', 'distinct', Rule::in($achievements->keys())],
        ]);

        $achievements->sync($request->user());
        $earnedKeys = array_flip($achievements->earnedKeys($request->user()->fresh()));
        $unearnedKeys = array_values(array_filter(
            $validated['achievement_keys'],
            fn (string $key) => ! isset($earnedKeys[$key])
        ));

        if ($unearnedKeys !== []) {
            throw ValidationException::withMessages([
                'achievement_keys' => ['Only currently earned Special Achievements may be favourited.'],
            ]);
        }

        $data = DB::transaction(function () use ($request, $validated) {
            $user = User::query()->lockForUpdate()->findOrFail($request->user()->id);

            $user->achievements()
                ->where('achievement_type', 'special')
                ->whereNotNull('position')
                ->update(['position' => null]);

            foreach ($validated['achievement_keys'] as $index => $key) {
                $user->achievements()
                    ->where('achievement_type', 'special')
                    ->where('achievement_key', $key)
                    ->update(['position' => $index + 1]);
            }

            return $user->favouriteAchievements()->get()->map(fn (UserFavouriteAchievement $favourite) => [
                'key' => $favourite->achievement_key,
                'position' => $favourite->position,
            ]);
        });

        return response()->json(['data' => $data]);
    }
}
