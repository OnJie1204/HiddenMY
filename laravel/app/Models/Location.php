<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class Location extends Model
{
    protected $fillable = [
        'user_id',
        'category_id',
        'place_name',
        'address',
        'state',
        'postcode',
        'description',
        'latitude',
        'longitude',
        'status',
        'vote_count',
        'verification_threshold',
        'ai_review_reason',
        'ai_reviewed_at',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function category()
    {
        return $this->belongsTo(Category::class);
    }

    public function images()
    {
        return $this->hasMany(LocationImage::class);
    }

    public function votes()
    {
        return $this->hasMany(Vote::class);
    }

    public function checkIns()
    {
        return $this->hasMany(CheckIn::class);
    }

    public function isVerified()
    {
        return $this->status === 'verified';
    }

    public function isPending()
    {
        return $this->status === 'pending';
    }

    public function isRejected()
    {
        return $this->status === 'rejected';
    }

    public function scopeHiddenGems(Builder $query)
    {
        return $query->where('status', 'verified');
    }

    public function getVoteProgressAttribute()
    {
        if ($this->verification_threshold <= 0) {
            return 100;
        }
        return min(100, round(($this->vote_count / $this->verification_threshold) * 100));
    }

    public function getRemainingVotesAttribute()
    {
        return max(0, $this->verification_threshold - $this->vote_count);
    }
}