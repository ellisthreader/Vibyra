<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Roadmap Part 6: a local (stdio) MCP server is the same pinned-catalogue row as a remote one, with `kind` 'local'.
 * It carries no URL, command or environment: only the Mac that runs it (`host_id`) and that Mac's opaque id for it
 * (`local_id`). Existing rows are remote.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agent_mcp_servers', function (Blueprint $t) {
            $t->string('kind', 10)->default('remote');
            $t->string('host_id', 64)->nullable();
            $t->string('local_id', 64)->nullable();
            $t->timestamp('last_seen_at')->nullable();
            $t->unique(['user_id', 'host_id', 'local_id'], 'agent_mcp_servers_local_unique');
        });
    }

    public function down(): void
    {
        Schema::table('agent_mcp_servers', function (Blueprint $t) {
            $t->dropUnique('agent_mcp_servers_local_unique');
            $t->dropColumn(['kind', 'host_id', 'local_id', 'last_seen_at']);
        });
    }
};
