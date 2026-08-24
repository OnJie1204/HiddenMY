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
        // A same-named table already exists from the earlier
        // 2026_07_19_123401_create_hidden_gems_table migration (superseded by
        // this one) — drop it first so a full fresh migration replay doesn't
        // fail with "table already exists". Both are dropped for good by
        // 2026_08_01_083521_modify_locations_and_drop_hidden_gem_tables anyway.
        Schema::dropIfExists('hidden_gems');

        Schema::create('hidden_gems', function (Blueprint $table) {
            $table->id();

            $table->foreignId('location_id')
                ->constrained('locations')
                ->onDelete('cascade');

            $table->foreignId('user_id')
                ->constrained('users')
                ->onDelete('cascade');

            $table->foreignId('category_id')
                ->constrained('hidden_gem_categories')
                ->onDelete('cascade');

            $table->string('place_name');
            $table->string('address');
            $table->string('state');
            $table->text('description');
            $table->float('latitude');
            $table->float('longitude');
            $table->string('status')->default('pending');

            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('hidden_gems');
    }
};
