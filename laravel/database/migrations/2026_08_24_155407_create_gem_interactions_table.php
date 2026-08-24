<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gem_interactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')
                  ->constrained('users')
                  ->onDelete('cascade');
            $table->foreignId('location_id')
                  ->constrained('locations')
                  ->onDelete('cascade');
            $table->enum('type', ['like', 'dislike', 'comment']);
            $table->text('comment')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'location_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gem_interactions');
    }
};