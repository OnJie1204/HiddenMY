<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A verified gem (pending_community_vote / hidden_gem / well_known) can be
 * reported for two things. Both resolve through the same community vote —
 * 5 confirms upholds it, 5 disputes rejects it.
 *
 *   permanently_closed     - the place has shut for good. Needs a check-in.
 *                            Upheld -> locations.permanently_closed_at set;
 *                            greyed everywhere, frozen, owner can only delete.
 *   incorrect_contact_info - the hours / phone / website are wrong. Needs a
 *                            check-in, same as permanently_closed. Upheld ->
 *                            locations.contact_flagged_at set; a warning icon
 *                            shows and clears on the owner's next contact edit.
 *                            No freeze.
 *
 * One report per reason may be open on a gem at a time.
 */
class Report extends Model
{
    use HasFactory;

    public const REASON_PERMANENTLY_CLOSED = 'permanently_closed';
    public const REASON_INCORRECT_CONTACT = 'incorrect_contact_info';

    public const REASONS = [
        self::REASON_PERMANENTLY_CLOSED,
        self::REASON_INCORRECT_CONTACT,
    ];

    /**
     * Every reason needs the reporter (and each verifier) to have checked in at
     * the place first — you have to have actually been there to report either a
     * closure or wrong contact details.
     */
    public const LOCATION_REQUIRED_REASONS = [
        self::REASON_PERMANENTLY_CLOSED,
        self::REASON_INCORRECT_CONTACT,
    ];

    public const STATUS_PENDING = 'pending';
    public const STATUS_UPHELD = 'upheld';
    public const STATUS_REJECTED = 'rejected';

    protected $fillable = [
        'user_id',
        'location_id',
        'reason',
        'description',
        'photo_path',
        'status',
        'confirm_count',
        'dispute_count',
        'resolved_at',
    ];

    protected $casts = [
        'resolved_at' => 'datetime',
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
        return $this->status === self::STATUS_PENDING;
    }

    /** Both reasons need a check-in at the place. */
    public function requiresCheckIn(): bool
    {
        return in_array($this->reason, self::LOCATION_REQUIRED_REASONS, true);
    }
}
