<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('menu_item_likes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('menu_item_id')
                  ->constrained('menu_items')
                  ->onDelete('cascade');
            $table->foreignId('user_id')
                  ->constrained('users')
                  ->onDelete('cascade');
            $table->timestamps();

            $table->unique(['menu_item_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('menu_item_likes');
    }
};
