<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->decimal('suggested_latitude', 10, 7)->nullable()->after('description');
            $table->decimal('suggested_longitude', 10, 7)->nullable()->after('suggested_latitude');
            $table->string('flagged_item')->nullable()->after('suggested_longitude');
            $table->foreignId('parent_report_id')->nullable()->after('id')
                  ->constrained('reports')->onDelete('cascade');
            $table->timestamp('delete_at')->nullable()->after('resolved_at');
        });
    }

    public function down(): void
    {
        Schema::table('reports', function (Blueprint $table) {
            $table->dropConstrainedForeignId('parent_report_id');
            $table->dropColumn(['suggested_latitude', 'suggested_longitude', 'flagged_item', 'delete_at']);
        });
    }
};
