<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A travel post no longer links to a single itinerary — it carries its own
 * frozen post_stops snapshot (seeded from any number of the author's
 * itineraries plus manual stops). Drops the now-unused column.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('travel_posts', 'trip_itinerary_id')) {
            return;
        }

        Schema::table('travel_posts', function (Blueprint $table) {
            // Drop the FK constraint first where the driver needs it named.
            try {
                $table->dropForeign(['trip_itinerary_id']);
            } catch (\Throwable $e) {
                // sqlite (tests) has no named FK to drop — ignore.
            }
            $table->dropColumn('trip_itinerary_id');
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('travel_posts', 'trip_itinerary_id')) {
            return;
        }

        Schema::table('travel_posts', function (Blueprint $table) {
            $table->foreignId('trip_itinerary_id')
                ->nullable()
                ->after('user_id')
                ->constrained('trip_itineraries')
                ->nullOnDelete();
        });
    }
};
