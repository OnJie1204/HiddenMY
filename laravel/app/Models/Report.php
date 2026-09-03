<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Report extends Model
{
    use HasFactory;

    public const REASONS = [
        'permanently_closed',
        'inappropriate_content',
    ];

    public const LOCATION_REQUIRED_REASONS = [
        'permanently_closed',
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
        'suggested_opening_hours',
        'suggested_phone',
        'suggested_website',
        'suggested_description',
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

    public function isPending(): bool
    {
        return $this->status === 'pending';
    }

    public function requiresLocationVerification(): bool
    {
        if (in_array($this->reason, self::LOCATION_REQUIRED_REASONS, true)) {
            return true;
        }

        return $this->reason === 'inappropriate_content'
            && $this->suggested_latitude !== null
            && $this->suggested_longitude !== null;
    }

    public function hasSuggestedContact(): bool
    {
        return $this->suggested_opening_hours !== null
            || $this->suggested_phone !== null
            || $this->suggested_website !== null;
    }

    public function hasSuggestedLocation(): bool
    {
        return $this->suggested_latitude !== null
            && $this->suggested_longitude !== null;
    }

    public function hasSuggestedDescription(): bool
    {
        return $this->suggested_description !== null
            && $this->suggested_description !== '';
    }

    public function hasSuggestedFix(): bool
    {
        return $this->hasSuggestedContact()
            || $this->hasSuggestedLocation()
            || $this->hasSuggestedDescription();
    }
}
