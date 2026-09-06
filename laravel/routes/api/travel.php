<?php

use App\Http\Controllers\Travel\TravelPostController;
use App\Http\Controllers\Travel\TripItineraryController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::post('trip-itineraries/{tripItinerary}/locations', [TripItineraryController::class, 'storeLocation']);
    Route::put('trip-itineraries/{tripItinerary}/locations/order', [TripItineraryController::class, 'updateLocationOrder']);
    Route::delete('trip-itineraries/{tripItinerary}/locations/{location}', [TripItineraryController::class, 'destroyLocation']);
    Route::apiResource('trip-itineraries', TripItineraryController::class);

    Route::get('my-travel-posts', [TravelPostController::class, 'myPosts']);
    Route::post('travel-posts', [TravelPostController::class, 'store']);
    Route::post('travel-posts/{id}/copy-trip', [TravelPostController::class, 'copyTrip']);
    Route::put('travel-posts/{id}', [TravelPostController::class, 'update']);
    Route::delete('travel-posts/{id}', [TravelPostController::class, 'destroy']);
});

Route::get('travel-posts', [TravelPostController::class, 'index']);
Route::get('travel-posts/{id}', [TravelPostController::class, 'show']);
Route::get('locations/{locationId}/travel-posts', [TravelPostController::class, 'forLocation']);
