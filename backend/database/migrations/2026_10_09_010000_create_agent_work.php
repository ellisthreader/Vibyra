<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('agent_work_activations', function (Blueprint $t) {
            $t->id(); $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('activation_key', 120); $t->string('kind', 20); $t->string('spec_hash', 64);
            $t->uuid('target_id'); $t->unsignedInteger('target_revision')->default(1);
            $t->text('runtime_snapshot'); $t->timestamps();
            $t->unique(['user_id', 'activation_key']); $t->index(['kind', 'target_id']);
        });
        foreach (['agent_work_goals', 'agent_work_followups'] as $name) Schema::create($name, function (Blueprint $t) use ($name) {
            $t->uuid('id')->primary(); $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('agent_id'); $t->string('title', 120); $t->uuid('runtime_binding_id');
            $t->text('runtime_snapshot'); $t->unsignedInteger('revision')->default(1);
            $t->string('status', 24)->default('active'); $t->string('reason', 100)->nullable();
            $t->timestamp('expires_at'); $t->timestamp('checked_at')->nullable()->index(); $t->timestamps();
            $t->index(['user_id', 'agent_id']); $t->index(['status', 'expires_at']);
            if ($name === 'agent_work_goals') $t->text('milestones');
            else {
                $t->text('prompt'); $t->text('condition'); $t->text('source_snapshot')->nullable(); $t->uuid('trigger_id')->nullable();
                $t->unsignedInteger('trigger_revision')->nullable(); $t->unsignedBigInteger('signal_cursor')->default(0);
                $t->uuid('event_id')->nullable(); $t->uuid('run_id')->nullable();
                $t->timestamp('due_at')->nullable(); $t->timestamp('activated_at');
                $t->index(['trigger_id', 'status']);
            }
        });
        Schema::create('agent_work_run_pins', function (Blueprint $t) {
            $t->uuid('run_id')->primary(); $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('work_kind', 20); $t->uuid('work_id'); $t->text('runtime_snapshot'); $t->timestamp('expires_at')->nullable();
        });
        Schema::create('agent_work_signals', function (Blueprint $t) {
            $t->id(); $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('trigger_id'); $t->unsignedInteger('trigger_revision');
            $t->string('authority_hash', 64); $t->uuid('event_id')->unique(); $t->string('subject', 191); $t->timestamp('created_at');
            $t->index(['trigger_id', 'trigger_revision', 'id']);
        });
        Schema::create('agent_work_observations', function (Blueprint $t) {
            $t->uuid('trigger_id')->primary(); $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('authority_hash', 64); $t->boolean('complete');
            $t->timestamp('observed_at'); $t->timestamp('complete_since')->nullable();
        });
    }

    public function down(): void
    {
        foreach (['agent_work_observations', 'agent_work_signals', 'agent_work_run_pins', 'agent_work_followups', 'agent_work_goals', 'agent_work_activations'] as $table) Schema::dropIfExists($table);
    }
};
