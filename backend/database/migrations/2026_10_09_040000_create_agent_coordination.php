<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        Schema::create('agent_groups', function (Blueprint $t) {
            $t->uuid('id')->primary(); $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('name', 120); $t->uuid('coordinator_id'); $t->json('members'); $t->unsignedInteger('revision')->default(1);
            $t->timestamp('deleted_at')->nullable(); $t->timestamps(); $t->index(['user_id', 'deleted_at']);
        });
        Schema::create('agent_group_messages', function (Blueprint $t) {
            $t->uuid('id')->primary(); $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('group_id')->index(); $t->unsignedInteger('group_revision'); $t->uuid('coordinator_id');
            $t->string('idempotency_key', 120); $t->string('request_hash', 64); $t->text('prompt'); $t->json('mentions');
            $t->uuid('runtime_binding_id'); $t->json('runtime_snapshot'); $t->text('member_snapshots'); $t->text('shared_context');
            $t->uuid('planning_run_id')->nullable()->unique(); $t->timestamps(); $t->unique(['user_id', 'idempotency_key']);
        });
        Schema::create('agent_workflows', function (Blueprint $t) {
            $t->uuid('id')->primary(); $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('group_id')->index(); $t->unsignedInteger('group_revision'); $t->uuid('message_id'); $t->uuid('coordinator_id');
            $t->string('activation_key', 120); $t->string('spec_hash', 64); $t->string('title', 120); $t->text('prompt');
            $t->uuid('runtime_binding_id'); $t->json('runtime_snapshot'); $t->text('member_snapshots'); $t->text('shared_context');
            $t->json('mentions'); $t->text('steps'); $t->text('final_criteria'); $t->uuid('final_run_id')->nullable();
            $t->string('status', 24)->default('active'); $t->unsignedInteger('revision')->default(1); $t->string('reason', 100)->nullable();
            $t->timestamp('expires_at'); $t->timestamp('checked_at')->nullable()->index(); $t->timestamps();
            $t->unique(['user_id', 'activation_key']); $t->index(['group_id', 'created_at']); $t->index(['status', 'expires_at']);
        });
        Schema::create('agent_coordination_runs', function (Blueprint $t) {
            $t->uuid('run_id')->primary(); $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('group_id'); $t->unsignedInteger('group_revision'); $t->uuid('message_id');
            $t->uuid('workflow_id')->nullable()->index(); $t->string('step_key', 40)->nullable(); $t->string('role', 16); $t->timestamp('created_at');
        });
    }
    public function down(): void
    {
        foreach (['agent_coordination_runs', 'agent_workflows', 'agent_group_messages', 'agent_groups'] as $table) Schema::dropIfExists($table);
    }
};
