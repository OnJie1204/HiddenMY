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
