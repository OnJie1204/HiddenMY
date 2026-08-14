<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The map queries gems by viewport (whereBetween on latitude/longitude, plus a
     * status filter). Without these the bounds query is a sequential scan on every
     * pan — fine at today's row count, not once the table grows.
     */
    public function up(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            $table->index(['latitude', 'longitude'], 'locations_lat_lng_idx');
            $table->index('status', 'locations_status_idx');
        });
    }

    public function down(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            $table->dropIndex('locations_lat_lng_idx');
            $table->dropIndex('locations_status_idx');
        });
    }
};
