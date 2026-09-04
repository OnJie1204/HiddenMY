<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AchievementMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_existing_favourite_data_is_preserved_and_backfilled(): void
    {
        $user = User::factory()->create();
        Schema::drop('user_achievements');
        Schema::create('user_favourite_achievements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('achievement_key', 64);
            $table->unsignedTinyInteger('position');
            $table->timestamps();
            $table->unique(['user_id', 'achievement_key']);
            $table->unique(['user_id', 'position']);
        });
        $createdAt = now()->subMonth()->startOfSecond();
        DB::table('user_favourite_achievements')->insert([
            'user_id' => $user->id,
            'achievement_key' => 'first-footprint',
            'position' => 1,
            'created_at' => $createdAt,
            'updated_at' => $createdAt,
        ]);

        $migration = require database_path('migrations/2026_09_02_000000_evolve_user_favourite_achievements_to_user_achievements.php');
        $migration->up();

        $this->assertFalse(Schema::hasTable('user_favourite_achievements'));
        $this->assertDatabaseHas('user_achievements', [
            'user_id' => $user->id,
            'achievement_key' => 'first-footprint',
            'achievement_type' => 'special',
            'position' => 1,
            'earned_at' => $createdAt->format('Y-m-d H:i:s'),
        ]);

        DB::table('user_achievements')->insert([
            'user_id' => $user->id,
            'achievement_key' => 'region:johor',
            'achievement_type' => 'region_stamp',
            'earned_at' => now(),
            'position' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->assertDatabaseHas('user_achievements', [
            'achievement_key' => 'region:johor',
            'position' => null,
        ]);
    }
}
