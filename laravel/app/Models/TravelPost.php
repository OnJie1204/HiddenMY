<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TravelPost extends Model
{
    protected $fillable = [
        'user_id',
        'title',
        'body',
        'cover_image_url',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /** The frozen, author-editable trip snapshot (replaces the old trip_itinerary link). */
    public function stops()
    {
        return $this->hasMany(PostStop::class)->orderBy('order_number');
    }

    /**
     * Gem stops mirrored into the post_locations pivot — powers the
     * "Community Stories" list on a gem's detail page and forLocation().
     * Kept in sync by TravelPostController whenever the snapshot changes.
     */
    public function locations()
    {
        return $this->belongsToMany(Location::class, 'post_locations')
            ->withPivot(['caption', 'order_number', 'visited'])
            ->withTimestamps()
            ->orderBy('post_locations.order_number');
    }

    public function images()
    {
        return $this->hasMany(PostImage::class)->orderBy('order_number');
    }
}
