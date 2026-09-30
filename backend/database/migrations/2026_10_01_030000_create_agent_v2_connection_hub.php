<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Agent V2 Phase 6 (rebuild Stage 3): the connections hub and remote MCP servers.
 * `scope_issue` remembers a provider's "insufficient scope" answer for one
 * connection generation, so a reconnect clears it without extra bookkeeping. An MCP
 * server is one `agent_connections` row (provider `mcp_<8 hex>`) plus this row,
 * which pins the tool list the person reviewed; a changed list needs review again.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agent_connections', function (Blueprint $t) {
            $t->text('scope_issue')->nullable();
        });
        Schema::create('agent_mcp_servers', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('connection_id')->unique();
            $t->string('slug', 20)->unique();
            $t->string('url', 2048);
            $t->string('name', 80);
            $t->string('protocol_version', 20)->nullable();
            $t->string('auth', 10)->default('none');
            // Encrypted JSON: issuer, endpoints, resource, client id/secret, scope.
            $t->text('oauth')->nullable();
            $t->longText('tools')->nullable();
            $t->string('tool_revision', 64)->nullable();
            $t->longText('pending_tools')->nullable();
            $t->string('pending_revision', 64)->nullable();
            $t->text('read_tools')->nullable();
            $t->string('status', 20)->default('pending_auth');
            $t->timestamps();
            $t->index(['user_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('agent_mcp_servers');
        Schema::table('agent_connections', function (Blueprint $t) {
            $t->dropColumn('scope_issue');
        });
    }
};
