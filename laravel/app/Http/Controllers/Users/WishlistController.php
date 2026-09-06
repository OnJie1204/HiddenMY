<?php

namespace App\Http\Controllers\Users;

use App\Http\Controllers\Controller;

use App\Models\Location;
use App\Models\Wishlist;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class WishlistController extends Controller
{
    /**
     * Only these two statuses are ever shown to users browsing gems (see
     * Location::scopePubliclyVisible), so they're the only ones worth saving.
     */
    private const WISHLISTABLE_STATUSES = ['hidden_gem', 'well_known', 'pending_community_vote'];

    public function index(): JsonResponse
    {
        // A gem can be soft-deleted (status -> 'deleted') by its owner after
        // someone has already wishlisted it — filter those out here rather
        // than leaving a stale/broken entry in the viewer's wishlist forever.
        $locations = Wishlist::with(['location.category', 'location.images'])
            ->where('user_id', Auth::id())
            ->whereHas('location', fn ($query) => $query->whereIn('status', self::WISHLISTABLE_STATUSES))
            ->latest()
            ->get()
            ->pluck('location')
            ->filter()
            ->values();

        return response()->json(['data' => $locations]);
    }

    public function store($locationId): JsonResponse
    {
        $location = Location::findOrFail($locationId);

        if (! in_array($location->status, self::WISHLISTABLE_STATUSES, true)) {
            return response()->json([
                'message' => 'Only hidden gems that have passed AI review can be added to your wishlist.',
            ], 422);
        }

        if (! $location->acceptsNewInteractions()) {
            return response()->json(['message' => Location::FROZEN_MESSAGE], 422);
        }

        Wishlist::firstOrCreate([
            'user_id' => Auth::id(),
            'location_id' => $location->id,
        ]);

        return response()->json(['message' => 'Added to wishlist']);
    }

    public function destroy($locationId): JsonResponse
    {
        Wishlist::where('user_id', Auth::id())
            ->where('location_id', $locationId)
            ->delete();

        return response()->json(['message' => 'Removed from wishlist']);
    }
}
