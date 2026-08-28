<?php

namespace App\Http\Controllers;

use App\Models\CheckIn;
use App\Models\Location;
use App\Models\PostImage;
use App\Models\TravelPost;
use App\Models\TripItinerary;
use App\Services\SpecialAchievementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;

class TravelPostController extends Controller
{
    /**
     * Only gems that have cleared AI review are safe to let people tag —
     * mirrors Wishlist's WISHLISTABLE_STATUSES so a post can't publicise a
     * still-pending or AI-rejected submission before it's ready to be seen.
     */
    private const TAGGABLE_STATUSES = ['hidden_gem', 'pending_community_vote'];

    private const RELATIONS = ['user', 'tripItinerary', 'images', 'locations.category', 'locations.images'];

    private const PUBLIC_LOCATION_COLUMNS = [
        'locations.id',
        'locations.category_id',
        'locations.place_name',
        'locations.address',
        'locations.state',
        'locations.description',
        'locations.latitude',
        'locations.longitude',
        'locations.status',
        'locations.report_status',
        'locations.vote_count',
        'locations.verification_threshold',
    ];

    public function __construct(private SpecialAchievementService $specialAchievements)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $query = TravelPost::with($this->publicRelations())->latest();

        if ($request->filled('state')) {
            $query->whereHas('locations', fn ($q) => $q->where('state', $request->state));
        }

        if ($request->filled('category')) {
            $query->whereHas('locations', fn ($q) => $q->where('category_id', $request->category));
        }

        return response()->json(['data' => $this->includeAuthorFavourites($query->get())]);
    }

    public function show($id): JsonResponse
    {
        $post = TravelPost::with($this->publicRelations())->findOrFail($id);

        return response()->json(['data' => $this->includeAuthorFavourites($post)]);
    }

    public function myPosts(): JsonResponse
    {
        $posts = TravelPost::with(self::RELATIONS)
            ->where('user_id', Auth::id())
            ->latest()
            ->get();

        return response()->json(['data' => $this->includeAuthorFavourites($posts)]);
    }

    public function forLocation($locationId): JsonResponse
    {
        $posts = TravelPost::with(['user:id,name,avatar_url', 'images'])
            ->whereHas('locations', fn ($q) => $q->where('locations.id', $locationId))
            ->latest()
            ->get();

        return response()->json(['data' => $this->includeAuthorFavourites($posts)]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = Auth::user();

        $data = $request->validate([
            'title' => 'required|string|max:150',
            'body' => 'required|string',
            'trip_itinerary_id' => 'nullable|exists:trip_itineraries,id',
            'location_ids' => 'array',
            'location_ids.*' => 'exists:locations,id',
            'captions' => 'array',
            'captions.*' => 'nullable|string|max:255',
            'cover_image' => 'nullable|image|max:5120',
            'images.*' => 'image|max:5120',
        ]);

        if (! empty($data['trip_itinerary_id'])) {
            $this->assertOwnsItinerary($data['trip_itinerary_id'], $user->id);
        }

        $locations = $this->resolveTaggableLocations($data['location_ids'] ?? []);

        $post = TravelPost::create([
            'user_id' => $user->id,
            'trip_itinerary_id' => $data['trip_itinerary_id'] ?? null,
            'title' => $data['title'],
            'body' => $data['body'],
        ]);

        if ($request->hasFile('cover_image')) {
            $coverUrl = $this->uploadToSupabase($request->file('cover_image'), 'covers');

            if (! $coverUrl) {
                $post->delete();

                return response()->json(['message' => 'Failed to upload cover image.'], 500);
            }

            $post->update(['cover_image_url' => $coverUrl]);
        }

        $this->attachLocations($post, $locations, $data['captions'] ?? [], $user->id);
        $this->storeGalleryImages($post, $request);

        return response()->json([
            'message' => 'Travel post published.',
            'data' => $this->includeAuthorFavourites($post->load(self::RELATIONS)),
        ], 201);
    }

    public function update($id, Request $request): JsonResponse
    {
        $post = TravelPost::findOrFail($id);

        if ($post->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $data = $request->validate([
            'title' => 'required|string|max:150',
            'body' => 'required|string',
            'trip_itinerary_id' => 'nullable|exists:trip_itineraries,id',
            'location_ids' => 'array',
            'location_ids.*' => 'exists:locations,id',
            'captions' => 'array',
            'captions.*' => 'nullable|string|max:255',
            'cover_image' => 'nullable|image|max:5120',
            'images.*' => 'image|max:5120',
            'remove_image_ids' => 'array',
            'remove_image_ids.*' => 'integer|exists:post_images,id',
        ]);

        if (! empty($data['trip_itinerary_id'])) {
            $this->assertOwnsItinerary($data['trip_itinerary_id'], $post->user_id);
        }

        $post->update([
            'title' => $data['title'],
            'body' => $data['body'],
            'trip_itinerary_id' => $data['trip_itinerary_id'] ?? null,
        ]);

        if ($request->hasFile('cover_image')) {
            $coverUrl = $this->uploadToSupabase($request->file('cover_image'), 'covers');

            if (! $coverUrl) {
                return response()->json(['message' => 'Failed to upload cover image.'], 500);
            }

            $post->update(['cover_image_url' => $coverUrl]);
        }

        if (! empty($data['remove_image_ids'])) {
            $post->images()->whereIn('id', $data['remove_image_ids'])->delete();
        }

        $locations = $this->resolveTaggableLocations($data['location_ids'] ?? []);
        $post->locations()->detach();
        $this->attachLocations($post, $locations, $data['captions'] ?? [], $post->user_id);

        $this->storeGalleryImages($post, $request);

        return response()->json([
            'message' => 'Travel post updated.',
            'data' => $this->includeAuthorFavourites($post->load(self::RELATIONS)),
        ]);
    }

    public function destroy($id): JsonResponse
    {
        $post = TravelPost::findOrFail($id);

        if ($post->user_id !== Auth::id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $post->delete();

        return response()->json(['message' => 'Travel post deleted.']);
    }

    private function assertOwnsItinerary(int $itineraryId, int $userId): void
    {
        $owned = TripItinerary::where('id', $itineraryId)->where('user_id', $userId)->exists();

        abort_unless($owned, 403, 'That trip does not belong to you.');
    }

    private function includeAuthorFavourites(TravelPost|Collection $posts): TravelPost|Collection
    {
        $postCollection = $posts instanceof TravelPost ? collect([$posts]) : $posts;
        $users = $postCollection->pluck('user')->filter()->unique('id')->values();
        $favouritesByUser = $this->specialAchievements->activeFavouritesForUsers($users->pluck('id'));

        $users->each(function ($user) use ($favouritesByUser) {
            $user->setAttribute(
                'favourite_achievements',
                $favouritesByUser->get($user->id, [])
            );
        });

        return $posts;
    }

    private function publicRelations(): array
    {
        return [
            'user:id,name,avatar_url',
            'tripItinerary',
            'images',
            'locations' => fn ($query) => $query->select(self::PUBLIC_LOCATION_COLUMNS),
            'locations.category:id,name',
            'locations.images:id,location_id,image_url',
        ];
    }

    /** Silently drops any tagged location that isn't publicly visible rather than failing the whole post. */
    private function resolveTaggableLocations(array $locationIds): Collection
    {
        if (empty($locationIds)) {
            return collect();
        }

        return Location::whereIn('id', $locationIds)
            ->whereIn('status', self::TAGGABLE_STATUSES)
            ->get();
    }

    private function attachLocations(TravelPost $post, Collection $locations, array $captions, int $userId): void
    {
        $visitedLocationIds = CheckIn::where('user_id', $userId)
            ->whereIn('location_id', $locations->pluck('id'))
            ->pluck('location_id')
            ->all();

        $locations->values()->each(function (Location $location, int $index) use ($post, $captions, $visitedLocationIds) {
            $post->locations()->attach($location->id, [
                'caption' => $captions[$index] ?? null,
                'order_number' => $index,
                'visited' => in_array($location->id, $visitedLocationIds, true),
            ]);
        });
    }

    private function storeGalleryImages(TravelPost $post, Request $request): void
    {
        if (! $request->hasFile('images')) {
            return;
        }

        $nextOrder = (int) $post->images()->max('order_number') + 1;

        foreach ($request->file('images') as $image) {
            $url = $this->uploadToSupabase($image, 'gallery');

            if (! $url) {
                continue;
            }

            PostImage::create([
                'travel_post_id' => $post->id,
                'image_url' => $url,
                'order_number' => $nextOrder++,
            ]);
        }
    }

    private function uploadToSupabase($image, string $folder): ?string
    {
        $fileName = "travel-posts/{$folder}/" . uniqid() . '.' . $image->getClientOriginalExtension();

        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . env('SUPABASE_KEY'),
            'apikey' => env('SUPABASE_KEY'),
            'Content-Type' => $image->getMimeType(),
        ])->withBody(
            file_get_contents($image->getRealPath()),
            $image->getMimeType()
        )->post(
            env('SUPABASE_URL') . '/storage/v1/object/post_images/' . $fileName
        );

        if ($response->failed()) {
            return null;
        }

        return env('SUPABASE_URL') . '/storage/v1/object/public/post_images/' . $fileName;
    }
}
