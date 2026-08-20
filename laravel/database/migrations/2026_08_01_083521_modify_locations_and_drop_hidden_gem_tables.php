<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            $table->enum('isHidden', ['yes', 'no', 'pending'])
                ->default('no')
                ->after('verification_threshold');
        });

        // Drop the unique index + FK + column on votes BEFORE dropping
        // hidden_gems, otherwise Postgres blocks the drop (dependent object
        // exists). The unique index must be dropped explicitly first — unlike
        // Postgres, SQLite's DROP COLUMN doesn't cascade-drop a dependent
        // unique index on its own.
        Schema::table('votes', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'hidden_gem_id']);
            $table->dropForeign(['hidden_gem_id']);
            $table->dropColumn('hidden_gem_id');
        });

        Schema::dropIfExists('hidden_gem_images');
        Schema::dropIfExists('hidden_gem_categories');
        Schema::dropIfExists('hidden_gems');
    }

    public function down(): void
    {
        Schema::table('locations', function (Blueprint $table) {
            $table->dropColumn('isHidden');
        });

        Schema::table('votes', function (Blueprint $table) {
            $table->foreignId('hidden_gem_id')->nullable()->constrained('hidden_gems');
        });

        // hidden_gems, hidden_gem_categories, hidden_gem_images
        // cannot be automatically restored — see note below.
    }
};