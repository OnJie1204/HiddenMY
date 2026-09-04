<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `trip_locations` on the shared database was hand-edited (sequence -> order_number,
 * and the unused location_name / location_type / description / place_id columns
 * dropped) without a matching migration, so a fresh `php artisan migrate` produced
 * a table the model code doesn't fit. This reconciles the two — every step is
 * guarded so it's a no-op on the database that's already been changed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trip_locations', function (Blueprint $table) {
            if (Schema::hasColumn('trip_locations', 'sequence') && ! Schema::hasColumn('trip_locations', 'order_number')) {
                $table->renameColumn('sequence', 'order_number');
            }
        });

        Schema::table('trip_locations', function (Blueprint $table) {
            foreach (['description', 'place_id', 'location_name', 'location_type'] as $dead) {
                if (Schema::hasColumn('trip_locations', $dead)) {
                    $table->dropColumn($dead);
                }
            }
        });

        Schema::table('trip_locations', function (Blueprint $table) {
            if (! Schema::hasColumn('trip_locations', 'order_number')) {
                $table->integer('order_number')->default(0);
            }
        });
    }

    public function down(): void
    {
        // One-way reconciliation — no meaningful rollback.
    }
};
