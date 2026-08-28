<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MenuItemLike extends Model
{
    protected $fillable = [
        'menu_item_id',
        'user_id',
    ];

    public function menuItem()
    {
        return $this->belongsTo(MenuItem::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
