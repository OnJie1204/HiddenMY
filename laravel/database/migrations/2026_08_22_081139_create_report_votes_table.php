<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('report_votes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('report_id')
                  ->constrained('reports')
                  ->onDelete('cascade');
            $table->foreignId('user_id')
                  ->constrained('users')
                  ->onDelete('cascade');
            $table->string('verdict'); // confirm | dispute
            $table->text('comment')->nullable();
            $table->timestamps();
            // One verify-vote per user per report — same shape as votes'
            // unique(user_id, location_id).
            $table->unique(['user_id', 'report_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('report_votes');
    }
};
