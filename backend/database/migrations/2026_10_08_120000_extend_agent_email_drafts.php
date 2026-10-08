<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agent_tool_actions', fn (Blueprint $t) => $t->uuid('draft_original_connection_id')->nullable());
        Schema::table('agent_draft_revisions', fn (Blueprint $t) => $t->uuid('connection_id')->nullable());
    }
    public function down(): void
    {
        Schema::table('agent_draft_revisions', fn (Blueprint $t) => $t->dropColumn('connection_id'));
        Schema::table('agent_tool_actions', fn (Blueprint $t) => $t->dropColumn('draft_original_connection_id'));
    }
};
