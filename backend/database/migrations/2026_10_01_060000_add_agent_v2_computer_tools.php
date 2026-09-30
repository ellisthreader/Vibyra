<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Agent V2 Phase 4 (rebuild Stage 5, local part): Mac computer tools on the V2 engine.
 * A granted Mac folder (`agent_workspaces`, chosen only on the Mac) maps to one
 * `agent_connections` row with provider `computer`. A computer action is claimed by
 * the leased runner (`claimed_generation`) and a branch publish records its server
 * phase (`uploaded` → `writing`) so a duplicate upload or job never writes twice.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agent_connections', function (Blueprint $t) {
            $t->uuid('workspace_id')->nullable()->unique();
        });
        Schema::table('agent_tool_actions', function (Blueprint $t) {
            $t->unsignedInteger('claimed_generation')->nullable();
            $t->string('phase', 20)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('agent_tool_actions', function (Blueprint $t) {
            $t->dropColumn(['claimed_generation', 'phase']);
        });
        Schema::table('agent_connections', function (Blueprint $t) {
            $t->dropUnique(['workspace_id']);
            $t->dropColumn('workspace_id');
        });
    }
};
