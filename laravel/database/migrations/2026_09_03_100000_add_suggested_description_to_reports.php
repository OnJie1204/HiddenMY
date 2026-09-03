<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * An inappropriate_content report on a gem still in community voting can
     * now flag the location, the description and/or the contact info at once,
     * each with the reporter's correction. Location uses the existing
     * suggested_latitude / suggested_longitude columns; contact uses the
     * suggested_opening_hours / _phone / _website columns; this adds the one
     * that was missing.
     */
    public function up(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->text('suggested_description')->nullable()->after('suggested_website');
        });
    }

    public function down(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->dropColumn('suggested_description');
        });
    }
};
