<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('trip_locations', function (Blueprint $table) {

            $table->id();

            $table->foreignId('trip_itinerary_id')
                ->constrained()
                ->cascadeOnDelete();

            // tourist_attraction or hidden_gem
            $table->enum('location_type', [
                'tourist_attraction',
                'hidden_gem'
            ]);

            $table->string('location_name');

            $table->decimal('latitude', 10, 7);

            $table->decimal('longitude', 10, 7);

            // Hidden Gem description (optional)
            $table->text('description')->nullable();

            // Google Maps Place ID (optional)
            $table->string('place_id')->nullable();

            // Order in the itinerary
            $table->integer('sequence');

            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('trip_locations');
    }
};
