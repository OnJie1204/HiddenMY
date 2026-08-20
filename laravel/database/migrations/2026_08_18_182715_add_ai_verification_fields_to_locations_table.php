<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            $table->unsignedTinyInteger('verification_score')->nullable()->after('ai_reviewed_at');
            $table->unsignedTinyInteger('verification_confidence')->nullable()->after('verification_score');
            $table->string('google_visibility_level', 20)->nullable()->after('verification_confidence');
            $table->unsignedTinyInteger('hiddenness_score')->nullable()->after('google_visibility_level');
            $table->unsignedTinyInteger('legitimacy_score')->nullable()->after('hiddenness_score');
            $table->string('legitimacy_level', 20)->nullable()->after('legitimacy_score');
            $table->unsignedTinyInteger('tourism_value_score')->nullable()->after('legitimacy_level');
            $table->string('tourism_value_level', 20)->nullable()->after('tourism_value_score');
            $table->unsignedTinyInteger('evidence_score')->nullable()->after('tourism_value_level');
            $table->string('evidence_level', 20)->nullable()->after('evidence_score');
            $table->string('duplicate_status', 20)->nullable()->after('evidence_level');
            $table->unsignedBigInteger('duplicate_of_location_id')->nullable()->after('duplicate_status');
            $table->json('verification_result_json')->nullable()->after('duplicate_of_location_id');
            $table->string('verification_model', 60)->nullable()->after('verification_result_json');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            $table->dropColumn([
                'verification_score',
                'verification_confidence',
                'google_visibility_level',
                'hiddenness_score',
                'legitimacy_score',
                'legitimacy_level',
                'tourism_value_score',
                'tourism_value_level',
                'evidence_score',
                'evidence_level',
                'duplicate_status',
                'duplicate_of_location_id',
                'verification_result_json',
                'verification_model',
            ]);
        });
    }
};
