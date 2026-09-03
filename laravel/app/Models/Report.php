<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Report extends Model
{
    use HasFactory;

    public const REASONS = [
        'permanently_closed',
        'incorrect_location',
        'not_actually_hidden',
        'duplicate',
        'inappropriate_content',
    ];

    public const LOCATION_REQUIRED_REASONS = [
        'permanently_closed',
        'incorrect_location',
    ];

    public const TIER_A_REASONS = [
        'duplicate',
        'not_actually_hidden',
    ];

    public const TIER_B_REASONS = [
        'permanently_closed',
        'incorrect_location',
        'inappropriate_content',
    ];

    public const IMMEDIATE_DELETE_REASONS = [
        'permanently_closed',
    ];

    public const AMENDABLE_REASONS = [
        'inappropriate_content',
        'incorrect_location',
    ];

    protected $fillable = [
        'user_id',
        'location_id',
        'parent_report_id',
        'reason',
        'description',
        'photo_path',
        'suggested_latitude',
        'suggested_longitude',
        'flagged_item',
        'status',
        'confirm_count',
        'dispute_count',
        'resolved_at',
        'delete_at',
    ];

    protected $casts = [
        'resolved_at' => 'datetime',
        'delete_at' => 'datetime',
        'suggested_latitude' => 'float',
        'suggested_longitude' => 'float',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function location()
    {
        return $this->belongsTo(Location::class);
    }

    public function votes()
    {
        return $this->hasMany(ReportVote::class);
    }

    public function parent()
    {
        return $this->belongsTo(Report::class, 'parent_report_id');
    }

    /** Fix-review cycles filed against this (upheld) report. */
    public function children()
    {
        return $this->hasMany(Report::class, 'parent_report_id');
    }

    public function isPending(): bool
    {
        return $this->status === 'pending';
    }

    public function isTierA(): bool
    {
        return in_array($this->reason, self::TIER_A_REASONS, true);
    }

    public function isTierB(): bool
    {
        return in_array($this->reason, self::TIER_B_REASONS, true);
    }
}
