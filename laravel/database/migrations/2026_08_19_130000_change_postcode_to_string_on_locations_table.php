<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Malaysian postcodes routinely start with 0 (e.g. Perlis, Kedah), so
     * storing this as an integer silently truncated the leading digit(s) —
     * and PHP's integer validation actually rejects a leading-zero numeric
     * string outright (filter_var('05000', FILTER_VALIDATE_INT) === false),
     * which is what surfaced this as a submission error in the first place.
     *
     * Width is 10, not 5, purely to fit pre-existing non-conforming rows
     * (some seeded/test rows have 6+ digit placeholder postcodes) without
     * truncating them — app-level validation (HiddenGemController) is what
     * actually enforces the real 5-digit format for new submissions.
     */
    public function up(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            $table->string('postcode', 10)->change();
        });
    }

    public function down(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            $table->integer('postcode')->change();
        });
    }
};
