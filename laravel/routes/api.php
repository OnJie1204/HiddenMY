<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\GoogleAuthController;
use App\Http\Controllers\HiddenGemController;
use App\Http\Controllers\TripItineraryController;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

Route::get('/ping', function () {
    return response()->json(['message' => 'Laravel connected!']);
});

Route::get('/auth/google/redirect', [GoogleAuthController::class, 'redirect']);
Route::get('/auth/google/callback', [GoogleAuthController::class, 'callback']);

// Public route (accessible without logging in)
Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);
Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
Route::post('/reset-password', [AuthController::class, 'resetPassword']);
Route::post('/resend-verification', [AuthController::class, 'resendVerification']);

// Email verification after registration (accessible without logging in, as users typically haven't logged in yet when they click the link).
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

// Routes requiring login
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::put('/profile', [AuthController::class, 'updateProfile']);
    Route::post('/profile/avatar', [AuthController::class, 'uploadAvatar']);
    Route::post('/change-password', [AuthController::class, 'changePassword']);
    Route::post('/verify-email', [AuthController::class, 'verifyNewEmail']); // 改 email 用，移到这里因为需要登入才能改自己的资料
    Route::post('/email/resend', function (Request $request) {
        $request->user()->sendEmailVerificationNotification();

        return response()->json(['message' => 'Verification link sent']);
    });

    // Trip Itineraries
    Route::post('trip-itineraries/{tripItinerary}/locations', [TripItineraryController::class, 'storeLocation']);
    Route::put('trip-itineraries/{tripItinerary}/locations/order', [TripItineraryController::class, 'updateLocationOrder']);
    Route::delete('trip-itineraries/{tripItinerary}/locations/{location}', [TripItineraryController::class, 'destroyLocation']);
    Route::apiResource('trip-itineraries', TripItineraryController::class);

    // ===== Hidden Gems API (for React) =====
    Route::get('hidden-gems', [HiddenGemController::class, 'index']);
    Route::get('hidden-gems/search', [HiddenGemController::class, 'search']);
    Route::get('hidden-gems/categories', [HiddenGemController::class, 'getCategories']);
    Route::get('hidden-gems/states', [HiddenGemController::class, 'getStates']);
    Route::get('hidden-gems/geocode', [HiddenGemController::class, 'geocode']);
    Route::post('hidden-gems', [HiddenGemController::class, 'store']);
    Route::get('my-hidden-gems', [HiddenGemController::class, 'myHiddenGems']);
    Route::patch('hidden-gems/{id}/status', [HiddenGemController::class, 'updateStatus']);
    Route::get('hidden-gems-in-bounds', [HiddenGemController::class, 'inBounds']);
    Route::get('nearby-attractions', [HiddenGemController::class, 'nearbyAttractions']);
    Route::get('hidden-gems/{id}/nearby', [HiddenGemController::class, 'nearby']);
    Route::get('hidden-gems/{id}', [HiddenGemController::class, 'show']);
});
Route::get('recent-hidden-gems', [HiddenGemController::class, 'recent']);
Route::get('popular-hidden-gems', [HiddenGemController::class, 'popular']);

