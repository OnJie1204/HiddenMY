<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tracks when a place's contact fields (opening hours / phone / website) were
 * last changed, so the detail page can show "Contact info updated <date>".
 * Separate from updated_at, which moves on any edit.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            if (! Schema::hasColumn('locations', 'contact_updated_at')) {
                $table->timestamp('contact_updated_at')->nullable()->after('website');
            }
        });
    }

    public function down(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            $table->dropColumn('contact_updated_at');
        });
    }
};
