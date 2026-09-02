<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TripLocation extends Model
{
    protected $fillable = [
        'trip_itinerary_id',
        'location_id',
        'osm_id',
        'osm_name',
        'latitude',
        'longitude',
        'isHidden',
        'order_number',
    ];

    /**
     * Bump the parent itinerary's updated_at whenever a stopping point is
     * added or removed, so the "Last Modified" date reflects stop changes and
     * not just renames. (Reordering goes through a query-builder update in
     * TripItineraryController@updateLocationOrder, which skips model events, so
     * that path touches the itinerary explicitly.)
     */
    protected $touches = ['itinerary'];

    public function itinerary()
    {
        // Explicit FK: the column is `trip_itinerary_id`, not the `itinerary_id`
        // Laravel would infer from the method name (which left this relation —
        // and therefore $touches — silently resolving to null).
        return $this->belongsTo(TripItinerary::class, 'trip_itinerary_id');
    }

    public function location()
    {
        return $this->belongsTo(Location::class);
    }
}
