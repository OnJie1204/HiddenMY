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
        'opening_hours',
        'phone',
        'website',
        'latitude',
        'longitude',
        'status',
        'report_status',
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

    /**
     * Just the first photo, for callers (like the map's viewport query) that
     * only ever render one thumbnail and shouldn't pay to eager-load every photo.
     */
    public function firstImage()
    {
        return $this->hasOne(LocationImage::class)->oldestOfMany();
    }

    public function votes()
    {
        return $this->hasMany(Vote::class);
    }

    public function checkIns()
    {
        return $this->hasMany(CheckIn::class);
    }

    public function gemInteractions()
    {
        return $this->hasMany(GemInteraction::class);
    }

    /** Star ratings only — GemInteraction also stores like/dislike rows under other types. */
    public function ratings()
    {
        return $this->hasMany(GemInteraction::class)->where('type', 'comment');
    }

    public function menuItems()
    {
        return $this->hasMany(MenuItem::class)->orderByDesc('like_count');
    }

    public function reports()
    {
        return $this->hasMany(Report::class);
    }

    /** The currently-open report, if any — a gem can only have one active
     *  report at a time (see ReportController::store's status gate). */
    public function activeReport()
    {
        return $this->hasOne(Report::class)->where('status', 'pending')->latestOfMany();
    }

    public function posts()
    {
        return $this->belongsToMany(TravelPost::class, 'post_locations')
            ->withPivot(['caption', 'order_number', 'visited'])
            ->withTimestamps()
            ->orderByDesc('post_locations.created_at');
    }

    // ==================== Interactions (Like / Dislike / Comment) ====================

    public function interactions()
    {
        return $this->hasMany(GemInteraction::class);
    }

    public function likes()
    {
        return $this->hasMany(GemInteraction::class)->where('type', 'like');
    }

    public function dislikes()
    {
        return $this->hasMany(GemInteraction::class)->where('type', 'dislike');
    }

    public function comments()
    {
        return $this->hasMany(GemInteraction::class)->where('type', 'comment');
    }

    // ==================== Status Helpers ====================

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

    public function isDelisted()
    {
        return $this->status === 'delisted';
    }

    /** A report is open and the community hasn't yet confirmed or disputed
     *  it. `status` stays 'hidden_gem' the whole time this is true — see the
     *  report_status column comment on why it's a separate flag. */
    public function isUnderReview()
    {
        return $this->report_status === 'under_review';
    }

    public function scopeHiddenGems(Builder $query)
    {
        return $query->where('status', 'hidden_gem');
    }

    /**
     * Statuses safe to surface on public (unauthenticated) listings — everything
     * that hasn't passed AI hiddenness verification yet must stay invisible.
     */
    public const PUBLICLY_VISIBLE_STATUSES = ['pending_community_vote', 'hidden_gem'];

    public static function isPubliclyVisible(self $location): bool
    {
        if (in_array($location->status, self::PUBLICLY_VISIBLE_STATUSES, true)) {
            return true;
        }

        return $location->status === 'delisted' && $location->report_status === 'upheld';
    }

    public function scopePubliclyVisible(Builder $query)
    {
        return $query->where(function (Builder $q) {
            $q->whereIn('status', self::PUBLICLY_VISIBLE_STATUSES)
                ->orWhere(function (Builder $q2) {
                    $q2->where('status', 'delisted')->where('report_status', 'upheld');
                });
        });
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