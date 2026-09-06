<?php

use App\Http\Controllers\Users\AchievementController;
use App\Http\Controllers\Users\FavouriteAchievementController;
use App\Http\Controllers\Users\UserController;
use App\Http\Controllers\Users\WishlistController;
use Illuminate\Support\Facades\Route;

Route::get('/users/{id}', [UserController::class, 'show']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me/favourite-achievements', [FavouriteAchievementController::class, 'index']);
    Route::put('/me/favourite-achievements', [FavouriteAchievementController::class, 'update']);
    Route::post('/me/achievements/sync', [AchievementController::class, 'sync']);

    Route::get('/wishlist', [WishlistController::class, 'index']);
    Route::post('/wishlist/{locationId}', [WishlistController::class, 'store']);
    Route::delete('/wishlist/{locationId}', [WishlistController::class, 'destroy']);
});
