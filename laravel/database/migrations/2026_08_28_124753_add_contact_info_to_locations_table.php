<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            // Best-effort, community-supplied — the submitter usually isn't the
            // owner, so these are informational like the rest of the listing,
            // not verified business records. All nullable/optional.
            $table->string('opening_hours')->nullable()->after('description');
            $table->string('phone')->nullable()->after('opening_hours');
            $table->string('website')->nullable()->after('phone');
        });
    }

    public function down(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            $table->dropColumn(['opening_hours', 'phone', 'website']);
        });
    }
};
