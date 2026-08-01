<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Add osm_id to trip_locations
        Schema::table('trip_locations', function (Blueprint $table) {
            $table->bigInteger('osm_id')->nullable()->after('location_id');
        });

        // 2. Make location_id nullable on trip_locations
        //    Must drop FK first, modify column, then re-add FK
        Schema::table('trip_locations', function (Blueprint $table) {
            $table->dropForeign(['location_id']);
        });

        Schema::table('trip_locations', function (Blueprint $table) {
            $table->foreignId('location_id')->nullable()->change();
        });

        Schema::table('trip_locations', function (Blueprint $table) {
            $table->foreign('location_id')
                ->references('id')->on('locations')
                ->restrictOnDelete();
        });

        // 3. Remove osm_id from locations
        Schema::table('locations', function (Blueprint $table) {
            $table->dropColumn('osm_id');
        });
    }

    public function down(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            $table->bigInteger('osm_id')->nullable();
        });

        Schema::table('trip_locations', function (Blueprint $table) {
            $table->dropForeign(['location_id']);
        });

        Schema::table('trip_locations', function (Blueprint $table) {
            $table->foreignId('location_id')->nullable(false)->change();
        });

        Schema::table('trip_locations', function (Blueprint $table) {
            $table->foreign('location_id')
                ->references('id')->on('locations')
                ->restrictOnDelete();

            $table->dropColumn('osm_id');
        });
    }
};