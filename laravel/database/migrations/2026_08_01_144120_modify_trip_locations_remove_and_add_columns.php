<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trip_locations', function (Blueprint $table) {
            $table->dropColumn(['location_name', 'location_type', 'latitude', 'longitude']);
            $table->boolean('isHidden')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('trip_locations', function (Blueprint $table) {
            $table->dropColumn('isHidden');
            $table->string('location_name')->nullable();
            $table->string('location_type')->nullable();
            $table->float('latitude')->nullable();
            $table->float('longitude')->nullable();
        });
    }
};