<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * System redesign — the "contact info is wrong" report now sets a flag that
 * shows a warning icon beside the Contact Info block and clears the moment the
 * owner saves a contact edit. `status` stays a plain string column, so the new
 * `well-known` value needs no schema change.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            if (! Schema::hasColumn('locations', 'contact_flagged_at')) {
                $table->timestamp('contact_flagged_at')->nullable()->after('report_status');
            }
        });
    }

    public function down(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            $table->dropColumn('contact_flagged_at');
        });
    }
};
