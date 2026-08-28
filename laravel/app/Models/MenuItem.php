<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MenuItem extends Model
{
    protected $fillable = [
        'location_id',
        'added_by_user_id',
        'name',
        'price',
        'like_count',
    ];

    protected $casts = [
        'price' => 'float',
        'like_count' => 'integer',
    ];

    public function location()
    {
        return $this->belongsTo(Location::class);
    }

    public function addedBy()
    {
        return $this->belongsTo(User::class, 'added_by_user_id');
    }

    public function likes()
    {
        return $this->hasMany(MenuItemLike::class);
    }
}
