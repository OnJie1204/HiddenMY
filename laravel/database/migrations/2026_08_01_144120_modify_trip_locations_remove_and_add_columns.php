<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trip_locations', function (Blueprint $table) {
            $table->dropColumn(['name', 'type', 'latitude', 'longitude']);
            $table->boolean('isHidden')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('trip_locations', function (Blueprint $table) {
            $table->dropColumn('isHidden');
            $table->string('name')->nullable();
            $table->string('type')->nullable();
            $table->float('latitude')->nullable();
            $table->float('longitude')->nullable();
        });
    }
};