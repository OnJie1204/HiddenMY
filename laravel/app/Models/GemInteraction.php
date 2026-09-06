<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class GemInteraction extends Model
{
    use HasFactory;

    public const COMMENT_EDIT_WINDOW_HOURS = 72;

    protected static function booted(): void
    {
        $evaluate = function (self $interaction) {
            if ($interaction->type === 'comment' || $interaction->getOriginal('type') === 'comment') {
                Location::evaluateStatus($interaction->location_id);
                if ($interaction->wasChanged('location_id')) {
                    Location::evaluateStatus($interaction->getOriginal('location_id'));
                }
            }
        };

        static::saved($evaluate);
        static::deleted($evaluate);
    }

    protected $fillable = [
        'user_id',
        'location_id',
        'type',
        'comment',
        'rating',
        'photo_path',
    ];

    protected $casts = [
        'rating' => 'integer',
    ];

    public function isCommentEditable(): bool
    {
        return now()->lte(
            $this->created_at->copy()->addHours(self::COMMENT_EDIT_WINDOW_HOURS)
        );
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function location()
    {
        return $this->belongsTo(Location::class);
    }
}
