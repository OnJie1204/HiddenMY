<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Pivot between travel_posts and locations: a post can tag several
        // gems (not necessarily every stop of its linked trip), and a gem can
        // be tagged by many posts — powers the "Community Stories" list on a
        // gem's detail page via the inverse relation.
        Schema::create('post_locations', function (Blueprint $table) {
            $table->id();

            $table->foreignId('travel_post_id')
                ->constrained()
                ->cascadeOnDelete();

            $table->foreignId('location_id')
                ->constrained()
                ->cascadeOnDelete();

            $table->string('caption')->nullable();
            $table->unsignedInteger('order_number')->default(0);

            // Snapshot of whether the author had a check-in at this location
            // at the time of tagging — shown as a "Verified Visitor" badge.
            $table->boolean('visited')->default(false);

            $table->timestamps();

            $table->unique(['travel_post_id', 'location_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('post_locations');
    }
};
