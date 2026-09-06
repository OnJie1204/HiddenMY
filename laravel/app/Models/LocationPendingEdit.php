<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Legacy description/photo proposals retained for migration compatibility.
 *
 * New proposals are disabled. Any still-pending rows are rejected by
 * ReviewPendingLocationEdit because verified gems can only update contact
 * information.
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
