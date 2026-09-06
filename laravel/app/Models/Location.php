<?php

namespace App\Models;

use App\Services\Achievements\SpecialAchievementService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class Location extends Model
{
    use HasFactory;

    /**
     * The gem lifecycle (see the HiddenMY Redesign spec):
     *   pending               - AI hasn't verified yet (running, or a technical
     *                           failure being retried). Private.
     *   ai_rejected           - failed AI: score, outside Malaysia, duplicate,
     *                           or unsafe content. Private.
     *   pending_community_vote - passed AI, collecting votes. Public.
     *   hidden_gem            - reached the vote threshold. Public.
     *   well_known            - post tags + ratings >= 50 (one-way). Public, but
     *                           shown on its own page, not the hidden-gems list.
     *   archived             - a formerly verified, permanently closed place
     *                           removed by its owner. Retained for history but
     *                           excluded from public and owner-facing listings.
     *   deleted              - soft-deleted behind a strong confirm. Invisible
     *                           to everyone, including the owner.
     *
     * Two flags ride alongside status without changing it:
     *   permanently_closed_at  - 5 confirmed "permanently closed" reports.
     *                            Greyed everywhere, frozen, owner can only delete.
     *   contact_flagged_at     - 5 confirmed "incorrect contact info" reports.
     *                            Shows a warning icon; cleared on the owner's
     *                            next contact edit. No freeze.
     */
    public const STATUS_PENDING = 'pending';

    public const STATUS_AI_REJECTED = 'ai_rejected';

    public const STATUS_PENDING_VOTE = 'pending_community_vote';

    public const STATUS_HIDDEN_GEM = 'hidden_gem';

    public const STATUS_WELL_KNOWN = 'well_known';

    public const STATUS_ARCHIVED = 'archived';

    public const STATUS_DELETED = 'deleted';

    /** Reached directly from pending/voting or hidden_gem. One-way. */
    public const WELL_KNOWN_THRESHOLD = 50;

    /**
     * AI-written fields — never mass-assignable from user input.
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
        'content_safety_score',
        'content_safety_level',
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
        'permanently_closed_at',
        'contact_flagged_at',
        'contact_updated_at',
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
        'content_safety_score',
        'content_safety_level',
        'duplicate_status',
        'duplicate_of_location_id',
        'verification_result_json',
        'verification_model',
    ];

    protected $casts = [
        'verification_result_json' => 'array',
        'ai_reviewed_at' => 'datetime',
        'permanently_closed_at' => 'datetime',
        'contact_flagged_at' => 'datetime',
        'contact_updated_at' => 'datetime',
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

    /** Star ratings only — GemInteraction also stores like/dislike rows. */
    public function ratings()
    {
        return $this->hasMany(GemInteraction::class)->where('type', 'comment');
    }

    /** Match the existing rating input rule; legacy unrated comments do not qualify. */
    public function qualifyingRatings()
    {
        return $this->ratings()->whereBetween('rating', [1, 5]);
    }

    public function menuItems()
    {
        return $this->hasMany(MenuItem::class)->orderByDesc('like_count');
    }

    public function reports()
    {
        return $this->hasMany(Report::class);
    }

    /** Open (still being voted on) reports — a gem can have one per reason. */
    public function openReports()
    {
        return $this->hasMany(Report::class)->where('status', 'pending');
    }

    /** Owner's proposed description/photo edits awaiting the AI review. */
    public function pendingEdits()
    {
        return $this->hasMany(LocationPendingEdit::class);
    }

    public function pendingEdit()
    {
        return $this->hasOne(LocationPendingEdit::class)
            ->where('status', 'pending_review')
            ->latestOfMany();
    }

    /** Travel-post gem tags (drives "Community Stories" on the detail page). */
    public function posts()
    {
        return $this->belongsToMany(TravelPost::class, 'post_locations')
            ->withPivot(['caption', 'order_number', 'visited'])
            ->withTimestamps()
            ->orderByDesc('post_locations.created_at');
    }

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

    // ==================== Status helpers ====================

    public const PROMOTABLE_STATUSES = [
        Location::STATUS_PENDING,
        Location::STATUS_PENDING_VOTE,
        Location::STATUS_HIDDEN_GEM,
    ];

    /** Promotions are one-way; removal and closure are separate lifecycle rules. */
    public static function evaluateStatus(int $locationId): ?Location
    {
        return DB::transaction(function () use ($locationId) {
            $location = Location::query()->lockForUpdate()->find($locationId);

            if (! $location || $location->isPermanentlyClosed()
                || ! in_array($location->status, self::PROMOTABLE_STATUSES, true)) {
                return $location;
            }

            $location->loadCount(['posts', 'qualifyingRatings']);
            $status = $location->status;

            if ($location->posts_count + $location->qualifying_ratings_count >= Location::WELL_KNOWN_THRESHOLD) {
                $status = Location::STATUS_WELL_KNOWN;
            } elseif ($location->isPendingCommunityVote()
                && $location->vote_count >= ($location->verification_threshold ?? 10)) {
                $status = Location::STATUS_HIDDEN_GEM;
            }

            if ($status !== $location->status) {
                $location->update(['status' => $status]);
                $ownerId = $location->user_id;
                DB::afterCommit(function () use ($ownerId) {
                    try {
                        if ($owner = User::find($ownerId)) {
                            app(SpecialAchievementService::class)->sync($owner);
                        }
                    } catch (\Throwable $exception) {
                        report($exception);
                    }
                });
            }

            return $location;
        });
    }

    public function isPending()
    {
        return $this->status === self::STATUS_PENDING;
    }

    public function isAiRejected()
    {
        return $this->status === self::STATUS_AI_REJECTED;
    }

    public function isPendingCommunityVote()
    {
        return $this->status === self::STATUS_PENDING_VOTE;
    }

    public function isHiddenGem()
    {
        return $this->status === self::STATUS_HIDDEN_GEM;
    }

    public function isWellKnown()
    {
        return $this->status === self::STATUS_WELL_KNOWN;
    }

    public function isDeleted()
    {
        return $this->status === self::STATUS_DELETED;
    }

    public function isArchived(): bool
    {
        return $this->status === self::STATUS_ARCHIVED;
    }

    /** Verified (past AI): only contact information may be edited. */
    public function isVerified(): bool
    {
        return in_array($this->status, [
            self::STATUS_PENDING_VOTE,
            self::STATUS_HIDDEN_GEM,
            self::STATUS_WELL_KNOWN,
        ], true);
    }

    /** A report is being voted on. `status` is unchanged while this is true. */
    public function isUnderReview()
    {
        return $this->report_status === 'under_review';
    }

    public function isPermanentlyClosed(): bool
    {
        return $this->permanently_closed_at !== null;
    }

    public function isContactFlagged(): bool
    {
        return $this->contact_flagged_at !== null;
    }

    /** A permanently-closed gem is frozen: no new check-ins, votes, ratings,
     *  comments, menu items, itinerary adds, post tags or reports. Existing
     *  content stays readable; the owner can only delete it. */
    public function acceptsNewInteractions(): bool
    {
        return $this->permanently_closed_at === null;
    }

    public const FROZEN_MESSAGE = 'This place is marked permanently closed, so it can no longer be checked in, rated, commented on, or added to.';

    // ==================== Visibility scopes ====================

    /**
     * Every status a member of the public may reach directly (by URL), tag in
     * a post, or add to an itinerary. Excludes only the private stages.
     */
    public const PUBLICLY_VISIBLE_STATUSES = [
        self::STATUS_PENDING_VOTE,
        self::STATUS_HIDDEN_GEM,
        self::STATUS_WELL_KNOWN,
    ];

    /**
     * Statuses shown on the Hidden Gems list + map. Well-known has graduated
     * to its own page.
     */
    public const DISCOVERABLE_STATUSES = [
        self::STATUS_PENDING_VOTE,
        self::STATUS_HIDDEN_GEM,
    ];

    /** Active verified contributions used for current dashboard counts. */
    public const CURRENT_VERIFIED_STATUSES = [
        self::STATUS_HIDDEN_GEM,
        self::STATUS_WELL_KNOWN,
    ];

    /** Lifetime verified contributions used to reconcile permanent awards. */
    public const ACHIEVEMENT_STATUSES = [
        self::STATUS_HIDDEN_GEM,
        self::STATUS_WELL_KNOWN,
        self::STATUS_ARCHIVED,
    ];

    public static function isPubliclyVisible(self $location): bool
    {
        return in_array($location->status, self::PUBLICLY_VISIBLE_STATUSES, true);
    }

    public function scopePubliclyVisible(Builder $query)
    {
        return $query->whereIn('status', self::PUBLICLY_VISIBLE_STATUSES);
    }

    /** The Hidden Gems list + map — well-known excluded. */
    public function scopeDiscoverable(Builder $query)
    {
        return $query->whereIn('status', self::DISCOVERABLE_STATUSES);
    }

    public function scopeWellKnown(Builder $query)
    {
        return $query->where('status', self::STATUS_WELL_KNOWN);
    }

    public function scopeHiddenGems(Builder $query)
    {
        return $query->where('status', self::STATUS_HIDDEN_GEM);
    }

    // ==================== Computed ====================

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
