<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Postgres-only (pg_trgm has no SQLite equivalent) — the local/test
        // sqlite connection just skips this fuzzy-search index rather than
        // failing a fresh migration replay; production (pgsql) is unaffected.
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('CREATE EXTENSION IF NOT EXISTS pg_trgm');
        DB::statement('CREATE INDEX locations_place_name_trgm_idx ON locations USING GIN (place_name gin_trgm_ops)');
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('DROP INDEX IF EXISTS locations_place_name_trgm_idx');
        // Not dropping the pg_trgm extension itself in down(),
        // in case other parts of the app/db come to rely on it later.
    }
};