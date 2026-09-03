<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TravelPost extends Model
{
    protected $fillable = [
        'user_id',
        'trip_itinerary_id',
        'title',
        'body',
        'cover_image_url',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function tripItinerary()
    {
        return $this->belongsTo(TripItinerary::class);
    }

    public function locations()
    {
        return $this->belongsToMany(Location::class, 'post_locations')
            ->withPivot(['caption', 'order_number'])
            ->withTimestamps()
            ->orderBy('post_locations.order_number');
    }

    public function images()
    {
        return $this->hasMany(PostImage::class)->orderBy('order_number');
    }
}
