<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Report extends Model
{
    use HasFactory;

    /**
     * A Hidden Gem — verified, or still in community voting — can be reported
     * for these two things. Both go through the same community confirm/dispute
     * vote (see ReportController).
     */
    public const REASONS = [
        'permanently_closed',
        'inappropriate_content',
    ];

    /**
     * Reasons that always need the reporter (and each verifier) to have
     * physically checked in at the gem — you can only know a place has closed
     * for good if you have been there. inappropriate_content is conditionally
     * check-in-gated instead (see requiresCheckIn()): only when it proposes a
     * corrected location.
     */
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

    /**
     * The reporter must have checked in at the gem to file this report (and
     * so must each verifier). Always true for permanently_closed; true for an
     * inappropriate_content report only when it proposes a new location — you
     * have to have stood there to know the pin is wrong.
     */
    public function requiresCheckIn(): bool
    {
        if (in_array($this->reason, self::LOCATION_REQUIRED_REASONS, true)) {
            return true;
        }

        return $this->reason === 'inappropriate_content' && $this->suggested_latitude !== null;
    }

    /** True when the reporter attached at least one corrected contact field. */
    public function hasSuggestedContact(): bool
    {
        return $this->suggested_opening_hours !== null
            || $this->suggested_phone !== null
            || $this->suggested_website !== null;
    }

    public function hasSuggestedLocation(): bool
    {
        return $this->suggested_latitude !== null && $this->suggested_longitude !== null;
    }

    public function hasSuggestedDescription(): bool
    {
        return $this->suggested_description !== null && $this->suggested_description !== '';
    }

    /** Any correction at all attached to this report. */
    public function hasSuggestedFix(): bool
    {
        return $this->hasSuggestedContact()
            || $this->hasSuggestedLocation()
            || $this->hasSuggestedDescription();
    }
}
