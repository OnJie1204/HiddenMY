<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OsmSyncCell extends Model
{
    protected $fillable = [
        'cell_key',
        'synced_at',
    ];

    protected $casts = [
        'synced_at' => 'datetime',
    ];
}
