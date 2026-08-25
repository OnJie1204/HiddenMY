<?php

namespace App\Services;

use App\Models\Category;
use App\Models\Location;
use App\Models\User;
use App\Models\UserFavouriteAchievement;
use App\Models\Vote;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class SpecialAchievementService
{
    public const KEYS = [
        'first-footprint',
        'gem-hunter',
        'halfway-there',
        'voice-of-the-community',
        'west-malaysia-explorer',
        'east-malaysia-explorer',
        'off-the-beaten-path',
        'hiddenmy-master',
    ];

    public const WEST_MALAYSIA_REGIONS = [
        'Johor',
        'Kedah',
        'Kelantan',
        'Melaka',
        'Negeri Sembilan',
        'Pahang',
        'Penang',
        'Perak',
        'Perlis',
        'Selangor',
        'Terengganu',
        'Kuala Lumpur',
        'Putrajaya',
    ];

    public const EAST_MALAYSIA_REGIONS = ['Sabah', 'Sarawak', 'Labuan'];

    public const ALL_REGIONS = [
        ...self::WEST_MALAYSIA_REGIONS,
        ...self::EAST_MALAYSIA_REGIONS,
    ];

    public function keys(): array
    {
        return self::KEYS;
    }

    public function isValidKey(string $key): bool
    {
        return in_array($key, self::KEYS, true);
    }

    /** @return array<string, bool> */
    public function earnedStates(User $user): array
    {
        return $this->earnedStatesForUserIds([$user->id])->get($user->id, $this->emptyEarnedStates());
    }

    /**
     * Return active public favourites for several users with a fixed number of queries.
     *
     * @return Collection<int, array<int, array{key: string, position: int}>>
     */
    public function activeFavouritesForUsers(iterable $userIds): Collection
    {
        $ids = collect($userIds)->map(fn ($id) => (int) $id)->filter()->unique()->values();

        if ($ids->isEmpty()) {
            return collect();
        }

        $earnedStates = $this->earnedStatesForUserIds($ids);

        return UserFavouriteAchievement::query()
            ->whereIn('user_id', $ids)
            ->orderBy('user_id')
            ->orderBy('position')
            ->get(['user_id', 'achievement_key', 'position'])
            ->groupBy('user_id')
            ->map(function (Collection $favourites, $userId) use ($earnedStates) {
                $states = $earnedStates->get((int) $userId, $this->emptyEarnedStates());

                return $favourites
                    ->filter(fn (UserFavouriteAchievement $favourite) => $states[$favourite->achievement_key] ?? false)
                    ->take(2)
                    ->map(fn (UserFavouriteAchievement $favourite) => [
                        'key' => $favourite->achievement_key,
                        'position' => $favourite->position,
                    ])
                    ->values()
                    ->all();
            });
    }

    /** @return Collection<int, array<string, bool>> */
    private function earnedStatesForUserIds(iterable $userIds): Collection
    {
        $ids = collect($userIds)->map(fn ($id) => (int) $id)->filter()->unique()->values();

        if ($ids->isEmpty()) {
            return collect();
        }

        $locationsByUser = Location::query()
            ->whereIn('user_id', $ids)
            ->where('status', 'hidden_gem')
            ->get(['user_id', 'state', 'category_id'])
            ->groupBy('user_id');

        $distinctVoteCounts = Vote::query()
            ->whereIn('user_id', $ids)
            ->selectRaw('user_id, COUNT(DISTINCT location_id) as vote_count')
            ->groupBy('user_id')
            ->pluck('vote_count', 'user_id');

        $meaningfulCategoryIds = Category::query()
            ->get(['id', 'name'])
            ->reject(fn (Category $category) => $this->normalizeCategoryName($category->name) === 'others')
            ->pluck('id');

        return $ids->mapWithKeys(function (int $userId) use (
            $locationsByUser,
            $distinctVoteCounts,
            $meaningfulCategoryIds
        ) {
            $locations = $locationsByUser->get($userId, collect());

            $regions = $locations
                ->pluck('state')
                ->map(fn ($state) => $this->canonicalRegion((string) $state))
                ->filter(fn ($state) => in_array($state, self::ALL_REGIONS, true))
                ->unique()
                ->values();

            $coveredCategoryIds = $locations
                ->pluck('category_id')
                ->filter()
                ->unique();

            return [$userId => [
                'first-footprint' => $locations->count() >= 1,
                'gem-hunter' => $locations->count() >= 5,
                'halfway-there' => $regions->count() >= 8,
                'voice-of-the-community' => (int) $distinctVoteCounts->get($userId, 0) >= 5,
                'west-malaysia-explorer' => $this->containsAll($regions->all(), self::WEST_MALAYSIA_REGIONS),
                'east-malaysia-explorer' => $this->containsAll($regions->all(), self::EAST_MALAYSIA_REGIONS),
                'off-the-beaten-path' => $meaningfulCategoryIds->isNotEmpty()
                    && $meaningfulCategoryIds->every(fn ($id) => $coveredCategoryIds->contains($id)),
                'hiddenmy-master' => $this->containsAll($regions->all(), self::ALL_REGIONS),
            ]];
        });
    }

    /** @return array<string, bool> */
    private function emptyEarnedStates(): array
    {
        return [
            ...array_fill_keys(self::KEYS, false),
        ];
    }

    /** @return list<string> */
    public function earnedKeys(User $user): array
    {
        return array_keys(array_filter($this->earnedStates($user)));
    }

    private function canonicalRegion(string $region): string
    {
        $trimmed = trim($region);

        return strcasecmp($trimmed, 'Malacca') === 0 ? 'Melaka' : $trimmed;
    }

    private function normalizeCategoryName(string $name): string
    {
        return Str::lower(trim($name));
    }

    private function containsAll(array $actual, array $required): bool
    {
        return count(array_diff($required, $actual)) === 0;
    }
}
