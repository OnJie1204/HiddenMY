<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Vote extends Model
{
    use HasFactory;

    // Legacy columns may still exist; stories and photos belong to other models.
    protected $hidden = ['travel_description', 'photo_path'];

    /*
     * Fields that can be stored when a community vote is created.
     *
     * A vote only represents which user voted for which Hidden Gem.
     * Ratings, comments, and photos are handled separately by
     * the community feedback functionality.
     */
    protected $fillable = [
        'user_id',
        'location_id',
    ];

    /**
     * Get the user who submitted the vote.
     */
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the Hidden Gem associated with the vote.
     */
    public function location()
    {
        return $this->belongsTo(Location::class);
    }
}
