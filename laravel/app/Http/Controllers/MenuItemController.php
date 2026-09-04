<?php

namespace App\Http\Controllers;

use App\Models\Location;
use App\Models\MenuItem;
use App\Models\MenuItemLike;
use App\Services\ProfanityFilter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class MenuItemController extends Controller
{
    private const MAX_NAME_LENGTH = 80;

    public function __construct(private ProfanityFilter $profanity)
    {
    }

    public function index($locationId): JsonResponse
    {
        Location::findOrFail($locationId);

        $userId = Auth::id();

        $items = MenuItem::where('location_id', $locationId)
            ->with('addedBy:id,name')
            ->orderByDesc('like_count')
            ->orderBy('created_at')
            ->get()
            ->map(function (MenuItem $item) use ($userId) {
                return [
                    'id' => $item->id,
                    'name' => $item->name,
                    'price' => $item->price,
                    'like_count' => $item->like_count,
                    'added_by' => $item->addedBy?->name,
                    'added_by_user_id' => $item->added_by_user_id,
                    'liked_by_me' => $userId
                        ? $item->likes()->where('user_id', $userId)->exists()
                        : false,
                ];
            });

        return response()->json(['data' => $items]);
    }

    public function store(Request $request, $locationId): JsonResponse
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['message' => 'Please login first'], 401);
        }

        $location = Location::findOrFail($locationId);

        if (!$location->acceptsNewInteractions()) {
            return response()->json(['message' => Location::FROZEN_MESSAGE], 403);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:'.self::MAX_NAME_LENGTH],
            'price' => ['nullable', 'numeric', 'min:0', 'max:99999.99'],
        ]);

        if (! $this->profanity->isClean($validated['name'])) {
            return response()->json([
                'message' => 'Please reword the item name — it looks like it contains inappropriate language.',
            ], 422);
        }

        $existing = MenuItem::where('location_id', $location->id)
            ->whereRaw('LOWER(name) = ?', [mb_strtolower(trim($validated['name']))])
            ->first();

        if ($existing) {
            return response()->json([
                'message' => 'This item is already listed — like it instead of adding it again.',
                'data' => $existing,
            ], 409);
        }

        $item = MenuItem::create([
            'location_id' => $location->id,
            'added_by_user_id' => $user->id,
            'name' => trim($validated['name']),
            'price' => $validated['price'] ?? null,
        ]);

        return response()->json([
            'message' => 'Item added.',
            'data' => $item,
        ], 201);
    }

    public function toggleLike($menuItemId): JsonResponse
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['message' => 'Please login first'], 401);
        }

        $item = MenuItem::with('location:id,permanently_closed_at')->findOrFail($menuItemId);

        if ($item->location && !$item->location->acceptsNewInteractions()) {
            return response()->json(['message' => Location::FROZEN_MESSAGE], 403);
        }

        $like = MenuItemLike::where('menu_item_id', $item->id)
            ->where('user_id', $user->id)
            ->first();

        if ($like) {
            $like->delete();
            $item->decrement('like_count');
            $liked = false;
        } else {
            MenuItemLike::create(['menu_item_id' => $item->id, 'user_id' => $user->id]);
            $item->increment('like_count');
            $liked = true;
        }

        return response()->json([
            'liked' => $liked,
            'like_count' => $item->fresh()->like_count,
        ]);
    }

    public function destroy($menuItemId): JsonResponse
    {
        $user = Auth::user();
        $item = MenuItem::findOrFail($menuItemId);

        // Whoever suggested it can remove it
        if (!$user || $item->added_by_user_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $item->delete();

        return response()->json(['message' => 'Item removed.']);
    }
}
