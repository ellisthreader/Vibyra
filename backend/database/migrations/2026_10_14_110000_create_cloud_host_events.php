<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cloud switching (docs/cloud-switching-contract.md section 2): phase changes the Cloud Host reports for a
 * conversation (running / waiting / finished / failed) plus `returned` rows the sync side may add. Metadata only:
 * no message content. Idempotent per (provider, id, phase, at); pruned after seven days by vibyra:cloud-activity-prune.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('cloud_host_events', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('workspace_id')->nullable();
            $t->string('provider', 16);
            $t->string('agent_session_id', 100);
            $t->string('project', 64);
            $t->string('phase', 12);
            $t->string('title', 200)->nullable();
            // The Live Activity card for this conversation (uuid v5 of user + provider + id), so a phone may register its token.
            $t->uuid('card_id')->nullable();
            $t->timestamp('at', 6);
            $t->timestamp('created_at')->nullable();
            $t->unique(['user_id', 'provider', 'agent_session_id', 'phase', 'at'], 'cloud_host_events_idempotent');
            $t->index(['user_id', 'at']);
            $t->index(['user_id', 'card_id']);
            $t->index('at');
        });
        // Runtime bearers are looked up by hash when a Host posts without naming its workspace.
        Schema::table('cloud_workspaces', fn (Blueprint $t) => $t->index('runtime_token_hash', 'cloud_workspaces_runtime_token_hash_index'));
    }

    public function down(): void
    {
        Schema::table('cloud_workspaces', fn (Blueprint $t) => $t->dropIndex('cloud_workspaces_runtime_token_hash_index'));
        Schema::dropIfExists('cloud_host_events');
    }
};
