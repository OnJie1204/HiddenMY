<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('locations')
            ->where('status', 'verified')
            ->update(['status' => 'hidden_gem']);
    }

    public function down(): void
    {
        // Intentionally irreversible: converting every hidden_gem row back to
        // verified would corrupt legitimate canonical rows created by the app.
    }
};
