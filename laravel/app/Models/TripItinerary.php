<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TripItinerary extends Model
{
    protected $fillable = [
        'trip_name',
        'user_id',
    ];

    public function locations()
    {
        return $this->hasMany(TripLocation::class)->orderBy('order_number');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
