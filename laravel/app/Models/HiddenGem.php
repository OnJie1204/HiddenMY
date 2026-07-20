<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HiddenGem extends Model
{
    protected $table = 'hidden_gems';

    protected $fillable = [
        'title',
        'description',
        'latitude',
        'longitude',
        'address',
        'state',
        'cover_image'
    ];
}
