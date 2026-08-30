<?php

namespace App\Http\Controllers;

use App\Models\Location;
use App\Models\GemInteraction;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;

class GemInteractionController extends Controller
{
    public function toggle(Request $request, $locationId)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json([
                'message' => 'Please login first'
            ], 401);
        }

        $request->validate([
            'type' => 'required|in:like,dislike,comment',
            'comment' => 'nullable|string|max:500',
            'rating' => 'required|integer|min:1|max:5',
            'photo' => 'nullable|image|max:5120',
        ]);

        $location = Location::findOrFail($locationId);

        // ============================
        // COMMENT / RATING
        // ============================
        if ($request->type === 'comment') {

            if ((int) $location->user_id === (int) $user->id) {
                return response()->json([
                    'message' => 'You cannot rate or comment on your own Hidden Gem.'
                ], 403);
            }

            if (!$request->rating) {
                return response()->json([
                    'message' => 'Rating is required.'
                ], 422);
            }

            $photoPath = null;

            // ============================
            // Upload Comment Photo
            // ============================
            if ($request->hasFile('photo')) {

                $photo = $request->file('photo');

                // IMPORTANT:
                // Bucket already called comment_photos,
                // so do NOT add comment_photos/ again here.
                $fileName = uniqid() . '.' . $photo->getClientOriginalExtension();

                $uploadUrl = rtrim(env('SUPABASE_URL'), '/')
                    . '/storage/v1/object/comment_photos/'
                    . $fileName;

                $response = Http::withHeaders([
                    'Authorization' => 'Bearer ' . env('SUPABASE_KEY'),
                    'apikey' => env('SUPABASE_KEY'),
                    'Content-Type' => $photo->getMimeType(),
                ])
                    ->withBody(
                        file_get_contents($photo->getRealPath()),
                        $photo->getMimeType()
                    )
                    ->post($uploadUrl);

                if ($response->failed()) {
                    return response()->json([
                        'message' => 'Failed to upload comment photo.',
                        'status' => $response->status(),
                        'error' => $response->json(),
                    ], 500);
                }

                // Save public URL into photo_path
                $photoPath = rtrim(env('SUPABASE_URL'), '/')
                    . '/storage/v1/object/public/comment_photos/'
                    . $fileName;
            }

            // Check whether user has already commented/rated
            $existingComment = GemInteraction::where('user_id', $user->id)
                ->where('location_id', $locationId)
                ->where('type', 'comment')
                ->first();

            // ============================
            // Update Existing Comment
            // ============================
            if ($existingComment) {

                if (!$existingComment->isCommentEditable()) {
                    return response()->json([
                        'message' => 'Comments can only be edited within 72 hours of posting.',
                    ], 403);
                }

                $existingComment->update([
                    'comment' => $request->comment,
                    'rating' => $request->rating,
                    'photo_path' => $photoPath ?? $existingComment->photo_path,
                ]);

                return response()->json([
                    'message' => 'Comment updated',
                    'action' => 'updated',
                    'type' => 'comment',
                    'data' => $existingComment->fresh(),
                ]);
            }

            // ============================
            // Create New Comment
            // ============================
            $interaction = GemInteraction::create([
                'user_id' => $user->id,
                'location_id' => $locationId,
                'type' => 'comment',
                'comment' => $request->comment,
                'rating' => $request->rating,
                'photo_path' => $photoPath,
            ]);

            return response()->json([
                'message' => 'Comment added',
                'action' => 'added',
                'type' => 'comment',
                'data' => $interaction,
            ], 201);
        }

        // ============================
        // LIKE / DISLIKE
        // ============================
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
        ], 201);
    }


    // =====================================================
    // GET INTERACTIONS
    // =====================================================
    public function getInteractions($locationId)
    {
        $comments = GemInteraction::where('location_id', $locationId)
            ->where('type', 'comment')
            ->with('user:id,name,avatar_url')
            ->orderBy('created_at', 'desc')
            ->get();

        $user = Auth::user();

        $userComment = null;

        if ($user) {
            $userComment = GemInteraction::where('user_id', $user->id)
                ->where('location_id', $locationId)
                ->where('type', 'comment')
                ->first();
        }

        return response()->json([
            'comments' => $comments,
            'user_comment' => $userComment,
        ]);
    }


    // =====================================================
    // UPDATE COMMENT
    // =====================================================
    public function updateComment(Request $request, $commentId)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json([
                'message' => 'Please login first'
            ], 401);
        }

        $comment = GemInteraction::where('id', $commentId)
            ->where('type', 'comment')
            ->first();

        if (!$comment) {
            return response()->json([
                'message' => 'Comment not found'
            ], 404);
        }

        if ($comment->user_id !== $user->id) {
            return response()->json([
                'message' => 'You are not authorized to edit this comment'
            ], 403);
        }

        $location = Location::find($comment->location_id);

        if ($location && (int) $location->user_id === (int) $user->id) {
            return response()->json([
                'message' => 'You cannot rate or comment on your own Hidden Gem.'
            ], 403);
        }

        if (!$comment->isCommentEditable()) {
            return response()->json([
                'message' => 'Comments can only be edited within 72 hours of posting.',
            ], 403);
        }

        $request->validate([
            'comment' => 'nullable|string|max:500',
            'rating' => 'required|integer|min:1|max:5',
            'photo' => 'nullable|image|max:5120',
            'remove_photo' => 'nullable|boolean',
        ]);

        $photoPath = $comment->photo_path;

        if ($request->boolean('remove_photo') && $comment->photo_path) {
            $publicPrefix = rtrim(env('SUPABASE_URL'), '/')
                . '/storage/v1/object/public/comment_photos/';

            if (str_starts_with($comment->photo_path, $publicPrefix)) {
                $objectPath = substr(
                    $comment->photo_path,
                    strlen($publicPrefix)
                );

                $deleteUrl = rtrim(env('SUPABASE_URL'), '/')
                    . '/storage/v1/object/comment_photos/'
                    . $objectPath;

                $deleteResponse = Http::withHeaders([
                    'Authorization' => 'Bearer ' . env('SUPABASE_KEY'),
                    'apikey' => env('SUPABASE_KEY'),
                ])->delete($deleteUrl);

                if ($deleteResponse->failed()) {
                    return response()->json([
                        'message' => 'Failed to remove comment photo.',
                        'status' => $deleteResponse->status(),
                        'error' => $deleteResponse->json(),
                    ], 500);
                }
            }

            $photoPath = null;
        }

        // ============================
        // Upload New Photo
        // ============================
        if ($request->hasFile('photo')) {

            $photo = $request->file('photo');

            $fileName = uniqid() . '.' . $photo->getClientOriginalExtension();

            $uploadUrl = rtrim(env('SUPABASE_URL'), '/')
                . '/storage/v1/object/comment_photos/'
                . $fileName;

            $response = Http::withHeaders([
                'Authorization' => 'Bearer ' . env('SUPABASE_KEY'),
                'apikey' => env('SUPABASE_KEY'),
                'Content-Type' => $photo->getMimeType(),
            ])
                ->withBody(
                    file_get_contents($photo->getRealPath()),
                    $photo->getMimeType()
                )
                ->post($uploadUrl);

            if ($response->failed()) {
                return response()->json([
                    'message' => 'Failed to upload comment photo.',
                    'status' => $response->status(),
                    'error' => $response->json(),
                ], 500);
            }

            $newPhotoPath = rtrim(env('SUPABASE_URL'), '/')
                . '/storage/v1/object/public/comment_photos/'
                . $fileName;

            if (!$request->boolean('remove_photo') && $comment->photo_path) {
                $publicPrefix = rtrim(env('SUPABASE_URL'), '/')
                    . '/storage/v1/object/public/comment_photos/';

                if (str_starts_with($comment->photo_path, $publicPrefix)) {
                    $oldObjectPath = substr(
                        $comment->photo_path,
                        strlen($publicPrefix)
                    );

                    $oldDeleteUrl = rtrim(env('SUPABASE_URL'), '/')
                        . '/storage/v1/object/comment_photos/'
                        . $oldObjectPath;

                    Http::withHeaders([
                        'Authorization' => 'Bearer ' . env('SUPABASE_KEY'),
                        'apikey' => env('SUPABASE_KEY'),
                    ])->delete($oldDeleteUrl);
                }
            }

            $photoPath = $newPhotoPath;
        }

        $comment->update([
            'comment' => $request->comment,
            'rating' => $request->rating,
            'photo_path' => $photoPath,
        ]);

        return response()->json([
            'message' => 'Comment updated successfully',
            'data' => $comment->fresh(),
        ]);
    }


    // =====================================================
    // DELETE COMMENT
    // =====================================================
    public function deleteComment($commentId)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json([
                'message' => 'Please login first'
            ], 401);
        }

        $comment = GemInteraction::where('id', $commentId)
            ->where('type', 'comment')
            ->first();

        if (!$comment) {
            return response()->json([
                'message' => 'Comment not found'
            ], 404);
        }

        if ($comment->user_id !== $user->id) {
            return response()->json([
                'message' => 'You are not authorized to delete this comment'
            ], 403);
        }

        if (!$comment->isCommentEditable()) {
            return response()->json([
                'message' => 'Comments can only be deleted within 72 hours of posting.',
            ], 403);
        }

        $comment->delete();

        return response()->json([
            'message' => 'Comment deleted successfully',
        ]);
    }


    // =====================================================
    // DELETE COMMENT PHOTO
    // =====================================================
    public function deleteCommentPhoto($commentId)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json([
                'message' => 'Please login first'
            ], 401);
        }

        $comment = GemInteraction::where('id', $commentId)
            ->where('type', 'comment')
            ->first();

        if (!$comment) {
            return response()->json([
                'message' => 'Comment not found'
            ], 404);
        }

        if ($comment->user_id !== $user->id) {
            return response()->json([
                'message' => 'Unauthorized'
            ], 403);
        }

        // ============================
        // Delete From Supabase Storage
        // ============================
        if ($comment->photo_path) {

            $publicPrefix = rtrim(env('SUPABASE_URL'), '/')
                . '/storage/v1/object/public/comment_photos/';

            if (str_starts_with($comment->photo_path, $publicPrefix)) {

                $objectPath = substr(
                    $comment->photo_path,
                    strlen($publicPrefix)
                );

                $deleteUrl = rtrim(env('SUPABASE_URL'), '/')
                    . '/storage/v1/object/comment_photos/'
                    . $objectPath;

                $response = Http::withHeaders([
                    'Authorization' => 'Bearer ' . env('SUPABASE_KEY'),
                    'apikey' => env('SUPABASE_KEY'),
                ])->delete($deleteUrl);

                if ($response->failed()) {
                    return response()->json([
                        'message' => 'Failed to delete photo from storage.',
                        'status' => $response->status(),
                        'error' => $response->json(),
                    ], 500);
                }
            }
        }

        $comment->update([
            'photo_path' => null
        ]);

        return response()->json([
            'message' => 'Photo deleted successfully',
            'data' => $comment->fresh(),
        ]);
    }
}