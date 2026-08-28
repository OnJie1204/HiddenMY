<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OsmAttraction extends Model
{
    protected $fillable = [
        'osm_type',
        'osm_id',
        'name',
        'type',
        'latitude',
        'longitude',
        'address',
        'opening_hours',
        'phone',
        'website',
        'wikidata_id',
        'image_url',
    ];
}
