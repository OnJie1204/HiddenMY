<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\GoogleAuthController;
use App\Http\Controllers\FavouriteAchievementController;
use App\Http\Controllers\AchievementController;
use App\Http\Controllers\HiddenGemController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\VoteController;
use App\Http\Controllers\TravelPostController;
use App\Http\Controllers\TripItineraryController;
use App\Http\Controllers\WishlistController;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\UserController;
use App\Http\Controllers\GemInteractionController;
use App\Http\Controllers\MenuItemController;

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

Route::get('/ping', function () {
    return response()->json(['message' => 'Laravel connected!']);
});

Route::get('/auth/google/redirect', [GoogleAuthController::class, 'redirect']);
Route::get('/auth/google/callback', [GoogleAuthController::class, 'callback']);

// ===== User Profile =====
Route::get('/users/{id}', [UserController::class, 'show']);

// ===== Public Auth Routes =====
Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login'])->name('login');
Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
Route::post('/reset-password', [AuthController::class, 'resetPassword']);
Route::post('/resend-verification', [AuthController::class, 'resendVerification']);
Route::post('/verify-email', [AuthController::class, 'verifyNewEmail']);

// Email verification
Route::get('/email/verify/{id}/{hash}', function ($id, $hash) {
    $user = User::findOrFail($id);

    if (! hash_equals((string) $hash, sha1($user->getEmailForVerification()))) {
        return response()->json(['message' => 'Invalid verification link'], 400);
    }

    if ($user->hasVerifiedEmail()) {
        return response()->json(['message' => 'Email already verified']);
    }

    $user->markEmailAsVerified();

    return response()->json(['message' => 'Email verified successfully. You can now log in.']);
})->middleware(['signed'])->name('verification.verify');

// ===== Protected Routes =====
Route::middleware('auth:sanctum')->group(function () {
    // Auth
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::put('/profile', [AuthController::class, 'updateProfile']);
    Route::post('/profile/avatar', [AuthController::class, 'uploadAvatar']);
    Route::post('/change-password', [AuthController::class, 'changePassword']);
    Route::get('/me/favourite-achievements', [FavouriteAchievementController::class, 'index']);
    Route::put('/me/favourite-achievements', [FavouriteAchievementController::class, 'update']);
    Route::post('/me/achievements/sync', [AchievementController::class, 'sync']);
    Route::post('/email/resend', function (Request $request) {
        $request->user()->sendEmailVerificationNotification();
        return response()->json(['message' => 'Verification link sent']);
    });

    // ===== Trip Itineraries =====
    Route::post('trip-itineraries/{tripItinerary}/locations', [TripItineraryController::class, 'storeLocation']);
    Route::put('trip-itineraries/{tripItinerary}/locations/order', [TripItineraryController::class, 'updateLocationOrder']);
    Route::delete('trip-itineraries/{tripItinerary}/locations/{location}', [TripItineraryController::class, 'destroyLocation']);
    Route::apiResource('trip-itineraries', TripItineraryController::class);

    // ===== Vote Routes =====
    Route::get('/votes/check/{locationId}', [VoteController::class, 'checkEligibility']);
    Route::post('/votes/{locationId}', [VoteController::class, 'store']);
    Route::get('/my-votes', [VoteController::class, 'myVotes']);

    // ===== Report Routes =====
    Route::get('/reports/check/{locationId}', [ReportController::class, 'checkEligibility']);
    Route::post('/reports/{locationId}', [ReportController::class, 'store']);
    Route::get('/reports/location/{locationId}', [ReportController::class, 'show']);
    Route::get('/reports/{report}/check', [ReportController::class, 'checkVerifyEligibility']);
    Route::post('/reports/{report}/verify', [ReportController::class, 'verify']);
    Route::post('/reports/{report}/request-fix-review', [ReportController::class, 'requestFixReview']);

    // ===== Wishlist =====
    Route::get('/wishlist', [WishlistController::class, 'index']);
    Route::post('/wishlist/{locationId}', [WishlistController::class, 'store']);
    Route::delete('/wishlist/{locationId}', [WishlistController::class, 'destroy']);

    // ===== Hidden Gems (write / account-specific) =====
    Route::get('hidden-gems/address-autocomplete', [HiddenGemController::class, 'addressAutocomplete']);
    Route::get('hidden-gems/geocode', [HiddenGemController::class, 'geocode']);
    Route::get('hidden-gems/reverse-geocode', [HiddenGemController::class, 'reverseGeocode']);
    Route::get('hidden-gems/reverse-geocode-address', [HiddenGemController::class, 'reverseGeocodeAddress']);
    Route::post('hidden-gems', [HiddenGemController::class, 'store']);
    Route::get('my-hidden-gems', [HiddenGemController::class, 'myHiddenGems']);
    Route::patch('hidden-gems/{id}/status', [HiddenGemController::class, 'updateStatus']);
    Route::put('hidden-gems/{id}', [HiddenGemController::class, 'update']);

    // ===== Travel Posts (write / account-specific) =====
    Route::get('my-travel-posts', [TravelPostController::class, 'myPosts']);
    Route::post('travel-posts', [TravelPostController::class, 'store']);
    Route::put('travel-posts/{id}', [TravelPostController::class, 'update']);
    Route::delete('travel-posts/{id}', [TravelPostController::class, 'destroy']);

    // ===== Gem Interactions (Like/Dislike/Comment) — write only, reading is public =====
    Route::post('/gem-interactions/{locationId}', [GemInteractionController::class, 'toggle']);
    Route::get('/my-ratings', [GemInteractionController::class, 'myRatings']);
    Route::put('/gem-interactions/comments/{commentId}', [GemInteractionController::class, 'updateComment']);
    Route::delete('/gem-interactions/comments/{commentId}', [GemInteractionController::class, 'deleteComment']);
    Route::delete('/gem-interactions/comments/{commentId}/photo', [GemInteractionController::class, 'deleteCommentPhoto']);

    // ===== Menu Items — write only, reading is public =====
    Route::post('/hidden-gems/{locationId}/menu-items', [MenuItemController::class, 'store']);
    Route::post('/menu-items/{menuItemId}/like', [MenuItemController::class, 'toggleLike']);
    Route::delete('/menu-items/{menuItemId}', [MenuItemController::class, 'destroy']);
});

// ===== Public Hidden Gems Routes — browsing only, no auth required. Every
// write (create/update/status) and every account-specific list (my-hidden-gems)
// stays in the protected group above; these only ever read already-published
// data (HiddenGemController::show()/nearby() additionally hide anything not
// in Location::publiclyVisible() from guests, see those methods). =====
Route::get('recent-hidden-gems', [HiddenGemController::class, 'recent']);
Route::get('popular-hidden-gems', [HiddenGemController::class, 'popular']);
Route::get('hidden-gems', [HiddenGemController::class, 'index']);
Route::get('hidden-gems/search', [HiddenGemController::class, 'search']);
Route::get('hidden-gems/categories', [HiddenGemController::class, 'getCategories']);
Route::get('hidden-gems/states', [HiddenGemController::class, 'getStates']);
Route::get('hidden-gems-in-bounds', [HiddenGemController::class, 'inBounds']);
Route::get('nearby-attractions', [HiddenGemController::class, 'nearbyAttractions']);
Route::get('hidden-gems/{id}/nearby', [HiddenGemController::class, 'nearby']);
Route::get('hidden-gems/{id}/nearby-gems', [HiddenGemController::class, 'nearbyGems']);
Route::get('hidden-gems/{id}', [HiddenGemController::class, 'show']);
Route::get('/votes/{locationId}', [VoteController::class, 'getVotes']);
Route::get('/gem-interactions/{locationId}', [GemInteractionController::class, 'getInteractions']);
Route::get('/hidden-gems/{locationId}/menu-items', [MenuItemController::class, 'index']);

// ===== Public Travel Posts Routes =====
Route::get('travel-posts', [TravelPostController::class, 'index']);
Route::get('travel-posts/{id}', [TravelPostController::class, 'show']);
Route::get('locations/{locationId}/travel-posts', [TravelPostController::class, 'forLocation']);