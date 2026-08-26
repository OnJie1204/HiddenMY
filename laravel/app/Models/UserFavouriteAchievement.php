<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserFavouriteAchievement extends Model
{
    protected $fillable = [
        'user_id',
        'achievement_key',
        'position',
    ];

    protected function casts(): array
    {
        return [
            'position' => 'integer',
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
