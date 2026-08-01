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

        // Drop the FK + column on votes BEFORE dropping hidden_gems,
        // otherwise Postgres blocks the drop (dependent object exists)
        Schema::table('votes', function (Blueprint $table) {
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