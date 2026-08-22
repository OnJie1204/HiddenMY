<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')
                  ->constrained('users')
                  ->onDelete('cascade');
            $table->foreignId('location_id')
                  ->constrained('locations')
                  ->onDelete('cascade');
            $table->string('reason');
            $table->text('description')->nullable();
            $table->string('photo_path')->nullable();
            $table->string('status')->default('pending');
            $table->unsignedInteger('confirm_count')->default(0);
            $table->unsignedInteger('dispute_count')->default(0);
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reports');
    }
};
