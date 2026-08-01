<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class Location extends Model
{
    protected $fillable = [
        'user_id',
        'category_id',
        'place_name',
        'address',
        'state',
        'postcode',
        'description',
        'latitude',
        'longitude',
        'isHidden',
        'status',
    ];

    /**
     * Limit a query to locations approved as Hidden Gems.
     */
    public function scopeHiddenGems(Builder $query): Builder
    {
        return $query->where('isHidden', 'yes');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function category()
    {
        return $this->belongsTo(Category::class);
    }

    public function images()
    {
        return $this->hasMany(LocationImage::class);
    }
}
