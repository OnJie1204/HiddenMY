<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('votes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')
                  ->constrained('users')
                  ->onDelete('cascade');
            $table->foreignId('location_id')
                  ->constrained('locations')
                  ->onDelete('cascade');
            $table->string('photo_path')->nullable();
            $table->text('travel_description')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'location_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('votes');
    }
};