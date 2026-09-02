<?php

namespace App\Models;

class UserFavouriteAchievement extends UserAchievement
{
    protected $table = 'user_achievements';

    protected static function booted(): void
    {
        static::creating(function (UserFavouriteAchievement $achievement) {
            $achievement->achievement_type ??= self::TYPE_SPECIAL;
            $achievement->earned_at ??= now();
        });
    }
}
