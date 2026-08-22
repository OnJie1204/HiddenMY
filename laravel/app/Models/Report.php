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
        return $this->status === 'pending';
    }
}
