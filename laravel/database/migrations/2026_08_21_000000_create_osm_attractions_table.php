<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('osm_attractions', function (Blueprint $table) {
            $table->id();
            $table->string('osm_type'); // node | way | relation
            $table->unsignedBigInteger('osm_id');
            $table->string('name');
            $table->string('type')->nullable(); // tourism/leisure/historic/... tag value
            $table->double('latitude');
            $table->double('longitude');
            $table->string('address')->nullable();
            $table->string('opening_hours')->nullable();
            $table->string('phone')->nullable();
            $table->string('website')->nullable();
            $table->timestamps();

            $table->unique(['osm_type', 'osm_id']);
            $table->index(['latitude', 'longitude']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('osm_attractions');
    }
};
