<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::rename('user_favourite_achievements', 'user_achievements');

        Schema::table('user_achievements', function (Blueprint $table) {
            $table->string('achievement_type', 32)->nullable()->after('achievement_key');
            $table->timestamp('earned_at')->nullable()->after('achievement_type');
        });

        Schema::table('user_achievements', function (Blueprint $table) {
            $table->unsignedTinyInteger('position')->nullable()->change();
        });

        DB::table('user_achievements')->update([
            'achievement_type' => 'special',
            'earned_at' => DB::raw('COALESCE(created_at, updated_at, CURRENT_TIMESTAMP)'),
        ]);

        Schema::table('user_achievements', function (Blueprint $table) {
            $table->string('achievement_type', 32)->nullable(false)->change();
            $table->timestamp('earned_at')->nullable(false)->change();
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE user_achievements ADD CONSTRAINT user_achievements_type_check CHECK (achievement_type IN ('special', 'region_stamp'))");
            DB::statement('ALTER TABLE user_achievements ADD CONSTRAINT user_achievements_position_check CHECK (position IS NULL OR position IN (1, 2))');
            DB::statement("ALTER TABLE user_achievements ADD CONSTRAINT user_achievements_region_position_check CHECK (achievement_type <> 'region_stamp' OR position IS NULL)");
        }
    }

    public function down(): void
    {
        $hasNonFavouriteAwards = DB::table('user_achievements')
            ->where(function ($query) {
                $query->where('achievement_type', '!=', 'special')
                    ->orWhereNull('position');
            })
            ->exists();

        if ($hasNonFavouriteAwards) {
            throw new RuntimeException('Cannot roll back user achievements while permanent non-favourite awards exist.');
        }

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE user_achievements DROP CONSTRAINT user_achievements_region_position_check');
            DB::statement('ALTER TABLE user_achievements DROP CONSTRAINT user_achievements_position_check');
            DB::statement('ALTER TABLE user_achievements DROP CONSTRAINT user_achievements_type_check');
        }

        Schema::table('user_achievements', function (Blueprint $table) {
            $table->dropColumn(['achievement_type', 'earned_at']);
        });

        Schema::table('user_achievements', function (Blueprint $table) {
            $table->unsignedTinyInteger('position')->nullable(false)->change();
        });

        Schema::rename('user_achievements', 'user_favourite_achievements');
    }
};
