<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `post_locations.visited` (created in 2026_08_21_090100) went missing from the
 * shared database without a migration. The TravelPost::locations() pivot loads
 * it (`withPivot('visited')`) and attachLocations() writes it, so every travel
 * post query 500s while it's absent. Guarded so it's a no-op where the column
 * is already present.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('post_locations', 'visited')) {
            Schema::table('post_locations', function (Blueprint $table) {
                $table->boolean('visited')->default(false)->after('order_number');
            });
        }
    }

    public function down(): void
    {
        // One-way reconciliation.
    }
};
