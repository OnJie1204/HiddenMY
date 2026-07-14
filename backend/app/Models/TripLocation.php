<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TripLocation extends Model
{
    protected $fillable = [
        'trip_itinerary_id',
        'location_type',
        'location_name',
        'latitude',
        'longitude',
        'description',
        'place_id',
        'sequence'
    ];

    public function itinerary()
    {
        return $this->belongsTo(TripItinerary::class);
    }
}