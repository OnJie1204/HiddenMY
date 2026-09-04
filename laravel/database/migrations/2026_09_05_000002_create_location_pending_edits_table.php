<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A verified gem's owner can propose a new description and/or extra photos.
 * The proposal sits here while an AI check decides whether it (a) is safe and
 * (b) still describes the same establishment. Applied -> the location is
 * updated and this row is marked applied; rejected -> nothing changes and the
 * reason is stored. One pending row per location (a new proposal replaces it).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('location_pending_edits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('location_id')->constrained('locations')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->text('proposed_description')->nullable();
            $table->json('proposed_image_urls')->nullable();
            $table->string('status')->default('pending_review'); // pending_review | applied | rejected
            $table->text('ai_reason')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();

            $table->index(['location_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('location_pending_edits');
    }
};
