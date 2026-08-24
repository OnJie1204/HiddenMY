<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('post_images', function (Blueprint $table) {
            $table->id();

            $table->foreignId('travel_post_id')
                ->constrained()
                ->cascadeOnDelete();

            $table->string('image_url');
            $table->unsignedInteger('order_number')->default(0);

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('post_images');
    }
};
