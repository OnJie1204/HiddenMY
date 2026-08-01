<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('CREATE EXTENSION IF NOT EXISTS pg_trgm');
        DB::statement('CREATE INDEX locations_place_name_trgm_idx ON locations USING GIN (place_name gin_trgm_ops)');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS locations_place_name_trgm_idx');
        // Not dropping the pg_trgm extension itself in down(),
        // in case other parts of the app/db come to rely on it later.
    }
};