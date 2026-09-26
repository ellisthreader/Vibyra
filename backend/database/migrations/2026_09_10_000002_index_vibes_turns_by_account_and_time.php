<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The index `UsageWindows` reads. Both rolling windows are a scan of one account's
 * turns since a moment, and `vibes_turns` was indexed only on `status` — so every
 * wallet read and every send would otherwise have walked the whole table, on the
 * one path that is already holding the account's wallet lock.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vibes_turns', function (Blueprint $t) {
            $t->index(['user_id', 'created_at'], 'vibes_turns_user_created_index');
        });
    }

    public function down(): void
    {
        Schema::table('vibes_turns', function (Blueprint $t) {
            $t->dropIndex('vibes_turns_user_created_index');
        });
    }
};
