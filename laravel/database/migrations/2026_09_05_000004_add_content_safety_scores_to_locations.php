<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * AI verification gains a fifth dimension — content_safety (0-100) — assessing
 * the description and photos for hate speech, harassment or explicit material.
 * A low score sends the submission to ai_rejected.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            if (! Schema::hasColumn('locations', 'content_safety_score')) {
                $table->unsignedTinyInteger('content_safety_score')->nullable()->after('evidence_level');
                $table->string('content_safety_level')->nullable()->after('content_safety_score');
            }
        });
    }

    public function down(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            $table->dropColumn(['content_safety_score', 'content_safety_level']);
        });
    }
};
