<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Location extends Model
{
    use HasFactory;

    /**
     * AI-written verification fields — never mass-assignable from user input.
     * store()/update() must not pass these through $request->validate()'d data.
     */
    public const AI_VERIFICATION_FIELDS = [
        'status',
        'verification_score',
        'verification_confidence',
        'google_visibility_level',
        'hiddenness_score',
        'legitimacy_score',
        'legitimacy_level',
        'tourism_value_score',
        'tourism_value_level',
        'evidence_score',
        'evidence_level',
        'duplicate_status',
        'duplicate_of_location_id',
        'verification_result_json',
        'verification_model',
        'ai_review_reason',
        'ai_reviewed_at',
        'verification_attempts',
    ];

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
        'verification_attempts',
        'verification_score',
        'verification_confidence',
        'google_visibility_level',
        'hiddenness_score',
        'legitimacy_score',
        'legitimacy_level',
        'tourism_value_score',
        'tourism_value_level',
        'evidence_score',
        'evidence_level',
        'duplicate_status',
        'duplicate_of_location_id',
        'verification_result_json',
        'verification_model',
    ];

    protected $casts = [
        'verification_result_json' => 'array',
        'ai_reviewed_at' => 'datetime',
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

    public function isPending()
    {
        return $this->status === 'pending';
    }

    public function isAiRejected()
    {
        return $this->status === 'ai_rejected';
    }

    public function isPendingCommunityVote()
    {
        return $this->status === 'pending_community_vote';
    }

    public function isHiddenGem()
    {
        return $this->status === 'hidden_gem';
    }

    public function scopeHiddenGems(Builder $query)
    {
        return $query->where('status', 'hidden_gem');
    }

    /**
     * Statuses safe to surface on public (unauthenticated) listings — everything
     * that hasn't passed AI hiddenness verification yet must stay invisible.
     */
    public function scopePubliclyVisible(Builder $query)
    {
        return $query->whereIn('status', ['pending_community_vote', 'hidden_gem']);
    }

    public function getVoteProgressAttribute()
    {
        $threshold = $this->verification_threshold ?? 10;
        if ($threshold <= 0) {
            return 100;
        }
        return min(100, round(($this->vote_count / $threshold) * 100));
    }

    public function getRemainingVotesAttribute()
    {
        $threshold = $this->verification_threshold ?? 10;
        return max(0, $threshold - $this->vote_count);
    }
}