<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Vote extends Model
{
    use HasFactory;

    public const COMMENT_EDIT_WINDOW_HOURS = 72;

    protected $fillable = [
        'user_id',
        'location_id',
        'photo_path',
        'travel_description',
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
