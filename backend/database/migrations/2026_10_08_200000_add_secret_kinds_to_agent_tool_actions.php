<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{DB, Schema};

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasColumn('agent_tool_actions', 'secret_kinds')) {
            Schema::table('agent_tool_actions', fn (Blueprint $table) => $table->text('secret_kinds')->nullable());
        }
    }

    public function down(): void
    {
        // Main's older rules migration owns the same column when already installed.
        if (DB::table('migrations')->where('migration', '2026_10_02_160100_create_agent_approval_rules')->exists()) return;
        if (Schema::hasColumn('agent_tool_actions', 'secret_kinds')) {
            Schema::table('agent_tool_actions', fn (Blueprint $table) => $table->dropColumn('secret_kinds'));
        }
    }
};
