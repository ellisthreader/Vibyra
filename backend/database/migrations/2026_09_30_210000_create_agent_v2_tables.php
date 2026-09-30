<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Agent V2 records. Connections map existing `vibes_integration_installs`
 * rows to stable IDs (install_id) so current connections keep working; extra
 * accounts for the same provider hold their own encrypted credential. None of
 * these tables touch the Vibes wallet.
 *
 * Schema only. Existing installs get their connection row lazily (`LegacyInstalls::sync` on every read path) and, if
 * wanted up front, from the chunked `vibyra:agent-v2-backfill-installs`; a migration must not walk a production table.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('agent_connections', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('provider', 40);
            $t->string('external_identity', 255)->nullable();
            // Legacy credential reference; null for accounts stored below.
            $t->unsignedBigInteger('install_id')->nullable()->unique();
            $t->text('credential')->nullable();
            $t->text('refresh_token')->nullable();
            $t->timestamp('expires_at')->nullable();
            $t->text('scopes')->nullable();
            $t->unsignedInteger('generation')->default(1);
            $t->unsignedInteger('capability_revision')->default(1);
            $t->string('health', 30)->default('healthy');
            $t->timestamp('install_connected_at')->nullable();
            $t->timestamp('revoked_at')->nullable();
            $t->timestamps();
            $t->index(['user_id', 'provider', 'revoked_at']);
        });
        Schema::create('agent_grants', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('agent_id');
            $t->uuid('connection_id');
            $t->text('operations');
            $t->unsignedInteger('revision')->default(1);
            $t->timestamp('revoked_at')->nullable();
            $t->timestamps();
            $t->index(['agent_id', 'connection_id', 'revoked_at']);
        });
        Schema::create('agent_runtime_bindings', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('host_id', 64);
            $t->string('provider', 40);
            $t->string('account_ref', 128);
            $t->string('model', 120);
            $t->string('effort', 20)->nullable();
            $t->text('capabilities');
            $t->string('provider_version', 60)->nullable();
            $t->string('runner_key_hash', 64);
            $t->unsignedInteger('revision')->default(1);
            $t->timestamp('last_seen_at')->nullable();
            $t->timestamp('revoked_at')->nullable();
            $t->timestamps();
            $t->index(['user_id', 'host_id', 'revoked_at']);
        });
        Schema::create('agent_runs', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('agent_id');
            $t->uuid('conversation_id')->nullable();
            // Admission order within one teammate conversation; turns run in this order.
            $t->unsignedInteger('conversation_seq');
            $t->string('idempotency_key', 100);
            $t->string('request_hash', 64);
            $t->longText('prompt');
            $t->text('attachments');
            $t->unsignedInteger('profile_revision');
            $t->text('grant_snapshot');
            $t->string('grant_hash', 64);
            $t->uuid('runtime_binding_id');
            $t->text('runtime_snapshot');
            $t->string('funding_source', 30)->default('connected_account');
            $t->string('state', 30);
            $t->text('state_reason')->nullable();
            $t->unsignedInteger('lease_generation')->default(0);
            $t->timestamp('lease_expires_at')->nullable();
            $t->unsignedInteger('event_seq')->default(0);
            $t->unsignedInteger('tool_calls')->default(0);
            $t->longText('answer')->nullable();
            $t->timestamp('cancel_requested_at')->nullable();
            $t->timestamp('started_at')->nullable();
            $t->timestamp('finished_at')->nullable();
            $t->timestamps();
            $t->unique(['user_id', 'idempotency_key']);
            $t->index(['runtime_binding_id', 'state']);
            $t->unique(['agent_id', 'conversation_seq']);
        });
        Schema::create('agent_run_events', function (Blueprint $t) {
            $t->id();
            $t->uuid('run_id');
            $t->unsignedInteger('seq');
            $t->string('type', 40);
            $t->text('payload');
            $t->string('source', 20);
            $t->timestamp('created_at');
            $t->unique(['run_id', 'seq']);
        });
        Schema::create('agent_tool_actions', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('run_id');
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('call_id', 100);
            $t->string('tool', 80);
            $t->string('kind', 10);
            $t->uuid('connection_id');
            $t->unsignedInteger('connection_generation');
            $t->uuid('grant_id');
            $t->unsignedInteger('grant_revision');
            $t->text('arguments');
            $t->string('args_hash', 64);
            $t->string('schema_revision', 20);
            $t->string('fingerprint', 64)->nullable();
            $t->string('state', 20);
            $t->string('decision', 10)->nullable();
            $t->timestamp('expires_at')->nullable();
            $t->timestamp('dispatched_at')->nullable();
            $t->longText('result')->nullable();
            $t->string('summary', 255)->nullable();
            $t->timestamps();
            $t->unique(['run_id', 'call_id']);
        });
        Schema::create('agent_receipts', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('run_id');
            $t->uuid('action_id')->unique();
            $t->string('provider_resource_id', 255)->nullable();
            $t->string('status', 12);
            $t->string('summary', 255)->nullable();
            $t->timestamps();
            $t->index('run_id');
        });
    }

    public function down(): void
    {
        foreach (['agent_receipts', 'agent_tool_actions', 'agent_run_events', 'agent_runs',
            'agent_runtime_bindings', 'agent_grants', 'agent_connections'] as $table) Schema::dropIfExists($table);
    }
};
