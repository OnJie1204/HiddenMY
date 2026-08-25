<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_favourite_achievements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('achievement_key', 64);
            $table->unsignedTinyInteger('position');
            $table->timestamps();

            $table->unique(['user_id', 'achievement_key']);
            $table->unique(['user_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_favourite_achievements');
    }
};
