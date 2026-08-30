<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('menu_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('location_id')
                  ->constrained('locations')
                  ->onDelete('cascade');
            $table->foreignId('added_by_user_id')
                  ->constrained('users')
                  ->onDelete('cascade');
            $table->string('name');
            $table->decimal('price', 8, 2)->nullable();
            $table->unsignedInteger('like_count')->default(0);
            $table->timestamps();

            $table->index(['location_id', 'like_count']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('menu_items');
    }
};
