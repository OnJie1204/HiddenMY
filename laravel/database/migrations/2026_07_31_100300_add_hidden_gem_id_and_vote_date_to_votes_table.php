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
        Schema::table('votes', function (Blueprint $table) {
            $table->foreignId('hidden_gem_id')
                ->nullable()
                ->after('location_id')
                ->constrained('hidden_gems')
                ->onDelete('cascade');

            $table->timestamp('vote_date')->nullable()->after('travel_description');

            $table->unique(['user_id', 'hidden_gem_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('votes', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'hidden_gem_id']);
            $table->dropForeign(['hidden_gem_id']);
            $table->dropColumn(['hidden_gem_id', 'vote_date']);
        });
    }
};
