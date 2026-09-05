<?php

use App\Http\Controllers\HiddenGems\GemInteractionController;
use App\Http\Controllers\HiddenGems\HiddenGemController;
use App\Http\Controllers\HiddenGems\MenuItemController;
use App\Http\Controllers\HiddenGems\ReportController;
use App\Http\Controllers\HiddenGems\VoteController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/votes/check/{locationId}', [VoteController::class, 'checkEligibility']);
    Route::post('/votes/checkin/{locationId}', [VoteController::class, 'checkIn']);
    Route::post('/votes/{locationId}', [VoteController::class, 'store']);
    Route::get('/my-votes', [VoteController::class, 'myVotes']);

    Route::get('/reports/check/{locationId}', [ReportController::class, 'checkEligibility']);
    Route::post('/reports/{locationId}', [ReportController::class, 'store']);
    Route::get('/reports/location/{locationId}', [ReportController::class, 'show']);
    Route::get('/reports/{report}/check', [ReportController::class, 'checkVerifyEligibility']);
    Route::post('/reports/{report}/verify', [ReportController::class, 'verify']);

    Route::get('hidden-gems/address-autocomplete', [HiddenGemController::class, 'addressAutocomplete']);
    Route::get('hidden-gems/geocode', [HiddenGemController::class, 'geocode']);
    Route::get('hidden-gems/reverse-geocode', [HiddenGemController::class, 'reverseGeocode']);
    Route::get('hidden-gems/reverse-geocode-address', [HiddenGemController::class, 'reverseGeocodeAddress']);
    Route::post('hidden-gems', [HiddenGemController::class, 'store']);
    Route::get('my-hidden-gems', [HiddenGemController::class, 'myHiddenGems']);
    Route::patch('hidden-gems/{id}/status', [HiddenGemController::class, 'updateStatus']);
    Route::put('hidden-gems/{id}', [HiddenGemController::class, 'update']);

    Route::post('/gem-interactions/{locationId}', [GemInteractionController::class, 'toggle']);
    Route::get('/my-ratings', [GemInteractionController::class, 'myRatings']);
    Route::put('/gem-interactions/comments/{commentId}', [GemInteractionController::class, 'updateComment']);
    Route::delete('/gem-interactions/comments/{commentId}', [GemInteractionController::class, 'deleteComment']);
    Route::delete('/gem-interactions/comments/{commentId}/photo', [GemInteractionController::class, 'deleteCommentPhoto']);

    Route::post('/hidden-gems/{locationId}/menu-items', [MenuItemController::class, 'store']);
    Route::post('/menu-items/{menuItemId}/like', [MenuItemController::class, 'toggleLike']);
    Route::delete('/menu-items/{menuItemId}', [MenuItemController::class, 'destroy']);
});

Route::get('recent-hidden-gems', [HiddenGemController::class, 'recent']);
Route::get('popular-hidden-gems', [HiddenGemController::class, 'popular']);
Route::get('hidden-gems', [HiddenGemController::class, 'index']);
Route::get('well-known-places', [HiddenGemController::class, 'wellKnown']);
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
