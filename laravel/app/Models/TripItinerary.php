<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Models\TripLocation;
use App\Models\User;

class TripItinerary extends Model
{
    protected $fillable = [
        'trip_name',
        'user_id'
    ];

    public function locations()
    {
        return $this->hasMany(TripLocation::class)->orderBy('sequence');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}