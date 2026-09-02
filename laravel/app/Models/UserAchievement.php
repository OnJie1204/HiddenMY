<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserAchievement extends Model
{
    public const TYPE_SPECIAL = 'special';

    public const TYPE_REGION_STAMP = 'region_stamp';

    protected $fillable = [
        'user_id',
        'achievement_key',
        'achievement_type',
        'earned_at',
        'position',
    ];

    protected function casts(): array
    {
        return [
            'earned_at' => 'datetime',
            'position' => 'integer',
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
