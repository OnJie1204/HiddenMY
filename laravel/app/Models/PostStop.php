<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One stop in a travel post's frozen trip snapshot. Seeded from the author's
 * tagged itineraries (their stops merged + deduped) and/or added by hand, then
 * never re-pulled from the source. A stop is either:
 *   - a gem  : location_id IS NOT NULL. It points at the Location row, which
 *              always survives (gems are soft-deleted). A snapshot of the name
 *              + coordinates is also kept so nothing has to be re-fetched.
 *   - an OSM place : location_id IS NULL. Purely a snapshot — no live source.
 *              osm_id may or may not be set (map-click stops have none).
 */
class PostStop extends Model
{
    protected $fillable = [
        'travel_post_id',
        'order_number',
        'location_id',
        'osm_id',
        'osm_name',
        'latitude',
        'longitude',
        'caption',
        'source_itinerary_id',
    ];

    protected $casts = [
        'latitude' => 'float',
        'longitude' => 'float',
        'order_number' => 'integer',
    ];

    public function travelPost()
    {
        return $this->belongsTo(TravelPost::class);
    }

    public function location()
    {
        return $this->belongsTo(Location::class);
    }

    public function sourceItinerary()
    {
        return $this->belongsTo(TripItinerary::class, 'source_itinerary_id');
    }

    public function isGemStop(): bool
    {
        return $this->location_id !== null;
    }
}
