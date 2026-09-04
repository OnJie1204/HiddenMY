<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A travel post carries one frozen, author-editable trip snapshot. It is
 * seeded from any number of the author's itineraries (their stops merged and
 * deduped) plus manual stops, and never re-pulls from the source afterwards.
 * A stop is either a gem (location_id) or an OpenStreetMap place (osm_*).
 * Replaces travel_posts.trip_itinerary_id.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('post_stops', function (Blueprint $table) {
            $table->id();
            $table->foreignId('travel_post_id')->constrained('travel_posts')->cascadeOnDelete();
            $table->unsignedInteger('order_number')->default(0);

            // gem stop
            $table->foreignId('location_id')->nullable()->constrained('locations')->nullOnDelete();

            // OpenStreetMap stop (snapshot — no live source)
            $table->bigInteger('osm_id')->nullable();
            $table->string('osm_name')->nullable();
            $table->double('latitude')->nullable();
            $table->double('longitude')->nullable();

            $table->string('caption')->nullable();
            // informational — which tagged itinerary this stop came from
            $table->foreignId('source_itinerary_id')->nullable()->constrained('trip_itineraries')->nullOnDelete();

            $table->timestamps();

            $table->index(['travel_post_id', 'order_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('post_stops');
    }
};
