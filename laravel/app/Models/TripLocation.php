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
        'isHidden',
        'order_number',
    ];

    public function itinerary()
    {
        return $this->belongsTo(TripItinerary::class);
    }

    public function location()
    {
        return $this->belongsTo(Location::class);
    }
}
