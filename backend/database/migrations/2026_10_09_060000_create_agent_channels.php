<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        Schema::create('agent_channel_identities', function (Blueprint $t) {
            $t->uuid('id')->primary(); $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('provider', 12); $t->uuid('connection_id'); $t->unsignedInteger('connection_generation');
            $t->uuid('reply_connection_id')->nullable(); $t->unsignedInteger('reply_connection_generation')->nullable();
            $t->string('workspace_id', 100); $t->string('actor_id', 100); $t->string('bot_id', 100);
            $t->string('app_id', 100); $t->string('label', 180); $t->string('identity_hash', 64); $t->unsignedInteger('revision')->default(1);
            $t->timestamps(); $t->unique(['user_id','identity_hash']); $t->index(['provider','workspace_id','actor_id']);
        });
        Schema::create('agent_channel_audiences', function (Blueprint $t) {
            $t->uuid('id')->primary(); $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('identity_id'); $t->string('audience_hash', 64); $t->string('kind', 12); $t->string('label', 200);
            $t->text('destination'); $t->timestamp('last_seen_at'); $t->timestamps(); $t->unique(['identity_id','audience_hash']);
        });
        Schema::create('agent_channel_bindings', function (Blueprint $t) {
            $t->uuid('id')->primary(); $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('identity_id'); $t->uuid('audience_id'); $t->uuid('agent_id'); $t->uuid('runtime_binding_id');
            $t->text('runtime_snapshot'); $t->text('public_instructions'); $t->unsignedInteger('revision')->default(1);
            $t->unsignedInteger('rate_per_hour'); $t->timestamp('expires_at'); $t->timestamp('revoked_at')->nullable();
            $t->string('request_hash', 64); $t->timestamps(); $t->index(['identity_id','audience_id']);
        });
        Schema::create('agent_channel_threads', function (Blueprint $t) {
            $t->uuid('id')->primary(); $t->foreignId('user_id')->constrained()->cascadeOnDelete(); $t->uuid('binding_id');
            $t->string('thread_hash', 64); $t->text('destination'); $t->timestamps(); $t->unique(['binding_id','thread_hash']);
        });
        Schema::create('agent_channel_events', function (Blueprint $t) {
            $t->uuid('id')->primary(); $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('identity_id'); $t->uuid('binding_id'); $t->unsignedInteger('binding_revision'); $t->uuid('thread_id');
            $t->string('event_hash', 64); $t->string('provider_event_id', 200); $t->string('actor_id', 100);
            $t->text('text'); $t->text('destination'); $t->string('state', 24)->default('pending'); $t->uuid('run_id')->nullable();
            $t->timestamp('checked_at')->nullable(); $t->timestamp('received_at'); $t->timestamps(); $t->unique(['user_id','event_hash']); $t->index(['state','created_at']);
        });
        Schema::create('agent_channel_runs', function (Blueprint $t) {
            $t->uuid('run_id')->primary(); $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('binding_id'); $t->unsignedInteger('binding_revision'); $t->uuid('thread_id'); $t->uuid('event_id');
            $t->text('context'); $t->timestamps();
        });
    }
    public function down(): void
    {
        foreach (['runs','events','threads','bindings','audiences','identities'] as $name) Schema::dropIfExists('agent_channel_'.$name);
    }
};
