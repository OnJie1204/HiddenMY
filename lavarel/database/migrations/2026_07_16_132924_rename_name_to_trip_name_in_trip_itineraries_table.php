<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trip_itineraries', function (Blueprint $table) {
            $table->renameColumn('name', 'trip_name');
        });
    }

    public function down(): void
    {
        Schema::table('trip_itineraries', function (Blueprint $table) {
            $table->renameColumn('trip_name', 'name');
        });
    }
};
