<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Reporting redesign (Hidden Gems module).
     *
     * A verified Hidden Gem can now be reported for only two things:
     *   - permanently_closed  -> 5 confirms grey it out in the UI but keep it
     *                            visible (locations.permanently_closed_at)
     *   - inappropriate_content (repurposed to "the contact info is wrong")
     *                          -> the reporter may attach the corrected hours /
     *                             phone / website (reports.suggested_*), and
     *                             5 confirms unlock a contact-only edit for the
     *                             owner (locations.contact_edit_unlocked_at)
     *
     * Nothing is deleted or delisted by a report any more, so the old
     * suggested_latitude / suggested_longitude / flagged_item / delete_at
     * columns are simply left unused rather than dropped.
     */
    public function up(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            $table->timestamp('permanently_closed_at')->nullable()->after('report_status');
            $table->timestamp('contact_edit_unlocked_at')->nullable()->after('permanently_closed_at');
        });

        Schema::table('reports', function (Blueprint $table) {
            $table->string('suggested_opening_hours', 255)->nullable()->after('flagged_item');
            $table->string('suggested_phone', 30)->nullable()->after('suggested_opening_hours');
            $table->string('suggested_website', 255)->nullable()->after('suggested_phone');
        });
    }

    public function down(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            $table->dropColumn(['permanently_closed_at', 'contact_edit_unlocked_at']);
        });

        Schema::table('reports', function (Blueprint $table) {
            $table->dropColumn(['suggested_opening_hours', 'suggested_phone', 'suggested_website']);
        });
    }
};
