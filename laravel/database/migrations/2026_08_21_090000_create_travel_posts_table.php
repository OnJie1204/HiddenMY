<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('travel_posts', function (Blueprint $table) {
            $table->id();

            $table->foreignId('user_id')
                ->constrained()
                ->cascadeOnDelete();

            // Optional — a post can recount a full trip, or just a standalone
            // writeup about a single gem with no formal itinerary behind it.
            $table->foreignId('trip_itinerary_id')
                ->nullable()
                ->constrained('trip_itineraries')
                ->nullOnDelete();

            $table->string('title');
            $table->text('body');
            $table->string('cover_image_url')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('travel_posts');
    }
};
