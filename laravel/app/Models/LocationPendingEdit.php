<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A verified gem's owner has proposed a new description and/or extra photos.
 * The row is reviewed by AI (ReviewPendingLocationEdit job): applied -> the
 * location is updated and status becomes 'applied'; rejected -> nothing
 * changes, ai_reason is stored, status becomes 'rejected'.
 */
class LocationPendingEdit extends Model
{
    public const STATUS_PENDING = 'pending_review';
    public const STATUS_APPLIED = 'applied';
    public const STATUS_REJECTED = 'rejected';

    protected $fillable = [
        'location_id',
        'user_id',
        'proposed_description',
        'proposed_image_urls',
        'status',
        'ai_reason',
        'reviewed_at',
    ];

    protected $casts = [
        'proposed_image_urls' => 'array',
        'reviewed_at' => 'datetime',
    ];

    public function location()
    {
        return $this->belongsTo(Location::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function isPending(): bool
    {
        return $this->status === self::STATUS_PENDING;
    }
}
