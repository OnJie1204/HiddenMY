<?php

namespace App\Http\Controllers;

use App\Models\Location;
use App\Models\GemInteraction;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class GemInteractionController extends Controller
{
    public function toggle(Request $request, $locationId)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['message' => 'Please login first'], 401);
        }

        $request->validate([
            'type' => 'required|in:like,dislike,comment',
            'comment' => 'nullable|string|max:500',
            'rating' => 'nullable|integer|min:1|max:5',
        ]);

        $location = Location::findOrFail($locationId);

        // ===== For like/dislike, remove the opposite type =====
        if ($request->type === 'like' || $request->type === 'dislike') {
            $oppositeType = $request->type === 'like' ? 'dislike' : 'like';
            GemInteraction::where('user_id', $user->id)
                ->where('location_id', $locationId)
                ->where('type', $oppositeType)
                ->delete();
        }

        // ===== For comment: must have rating, comment optional =====
        if ($request->type === 'comment') {
            // Rating is required
            if (!$request->rating) {
                return response()->json([
                    'message' => 'Rating is required.'
                ], 422);
            }

            $existingComment = GemInteraction::where('user_id', $user->id)
                ->where('location_id', $locationId)
                ->where('type', 'comment')
                ->first();

            if ($existingComment) {
                if (!$existingComment->isCommentEditable()) {
                    return response()->json([
                        'message' => 'Comments can only be edited within 72 hours of posting.',
                    ], 403);
                }

                // Update existing comment
                $existingComment->update([
                    'comment' => $request->comment,
                    'rating' => $request->rating,
                ]);

                return response()->json([
                    'message' => 'Comment updated',
                    'action' => 'updated',
                    'type' => 'comment',
                    'data' => $existingComment->fresh(),
                ]);
            }

            // Create new comment
            $interaction = GemInteraction::create([
                'user_id' => $user->id,
                'location_id' => $locationId,
                'type' => 'comment',
                'comment' => $request->comment,
                'rating' => $request->rating,
            ]);

            return response()->json([
                'message' => 'Comment added',
                'action' => 'added',
                'type' => 'comment',
                'data' => $interaction,
            ]);
        }

        // ===== For like/dislike: toggle behavior =====
        $existing = GemInteraction::where('user_id', $user->id)
            ->where('location_id', $locationId)
            ->where('type', $request->type)
            ->first();

        if ($existing) {
            $existing->delete();
            return response()->json([
                'message' => 'Removed',
                'action' => 'removed',
                'type' => $request->type,
            ]);
        }

        $interaction = GemInteraction::create([
            'user_id' => $user->id,
            'location_id' => $locationId,
            'type' => $request->type,
            'comment' => null,
            'rating' => null,
        ]);

        return response()->json([
            'message' => 'Added',
            'action' => 'added',
            'type' => $request->type,
            'data' => $interaction,
        ]);
    }

    public function getInteractions($locationId)
    {
        $location = Location::findOrFail($locationId);

        $likes = GemInteraction::where('location_id', $locationId)
            ->where('type', 'like')
            ->count();

        $dislikes = GemInteraction::where('location_id', $locationId)
            ->where('type', 'dislike')
            ->count();

        $comments = GemInteraction::where('location_id', $locationId)
            ->where('type', 'comment')
            ->with('user')
            ->orderBy('created_at', 'desc')
            ->get();

        $user = Auth::user();
        $userLike = null;
        $userDislike = null;
        $userComment = null;

        if ($user) {
            $userLike = GemInteraction::where('user_id', $user->id)
                ->where('location_id', $locationId)
                ->where('type', 'like')
                ->exists();

            $userDislike = GemInteraction::where('user_id', $user->id)
                ->where('location_id', $locationId)
                ->where('type', 'dislike')
                ->exists();

            $userComment = GemInteraction::where('user_id', $user->id)
                ->where('location_id', $locationId)
                ->where('type', 'comment')
                ->first();
        }

        return response()->json([
            'likes' => $likes,
            'dislikes' => $dislikes,
            'comments' => $comments,
            'user_like' => $userLike,
            'user_dislike' => $userDislike,
            'user_comment' => $userComment,
        ]);
    }

    public function updateComment(Request $request, $commentId)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['message' => 'Please login first'], 401);
        }

        $comment = GemInteraction::where('id', $commentId)
            ->where('type', 'comment')
            ->first();

        if (!$comment) {
            return response()->json(['message' => 'Comment not found'], 404);
        }

        if ($comment->user_id !== $user->id) {
            return response()->json(['message' => 'You are not authorized to edit this comment'], 403);
        }

        if (!$comment->isCommentEditable()) {
            return response()->json([
                'message' => 'Comments can only be edited within 72 hours of posting.',
            ], 403);
        }

        $request->validate([
            'comment' => 'nullable|string|max:500',
            'rating' => 'required|integer|min:1|max:5',
        ]);

        $comment->update([
            'comment' => $request->comment,
            'rating' => $request->rating,
        ]);

        return response()->json([
            'message' => 'Comment updated successfully',
            'data' => $comment->fresh(),
        ]);
    }

    public function deleteComment($commentId)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['message' => 'Please login first'], 401);
        }

        $comment = GemInteraction::where('id', $commentId)
            ->where('type', 'comment')
            ->first();

        if (!$comment) {
            return response()->json(['message' => 'Comment not found'], 404);
        }

        if ($comment->user_id !== $user->id) {
            return response()->json(['message' => 'You are not authorized to delete this comment'], 403);
        }

        $comment->delete();

        return response()->json([
            'message' => 'Comment deleted successfully',
        ]);
    }
}
