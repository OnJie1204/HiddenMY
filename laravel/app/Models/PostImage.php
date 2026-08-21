<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PostImage extends Model
{
    protected $fillable = [
        'travel_post_id',
        'image_url',
        'order_number',
    ];

    public function travelPost()
    {
        return $this->belongsTo(TravelPost::class);
    }
}
