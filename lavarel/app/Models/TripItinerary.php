<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Models\TripLocation;
use App\Models\User;

class TripItinerary extends Model
{
    protected $fillable = [
        'user_id',
        'name',
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