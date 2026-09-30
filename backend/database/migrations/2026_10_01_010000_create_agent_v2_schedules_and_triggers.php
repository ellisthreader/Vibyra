<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Agent V2 Phase 5: schedules and event triggers. Both only ever admit ordinary
 * account-funded runs through `AgentRuns\Admission`; nothing here touches Vibes.
 * Occurrences and trigger events are unique so a retried claim or a redelivered
 * webhook maps to the run it already started.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('agent_schedules', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('agent_id');
            $t->uuid('conversation_id')->nullable();
            $t->string('title', 120)->nullable();
            $t->text('prompt');
            $t->string('timezone', 64);
            // {type: once|daily|weekly, time: "HH:MM", date?: "YYYY-MM-DD", weekdays?: [1..7]}
            $t->text('recurrence');
            $t->unsignedInteger('revision')->default(1);
            $t->uuid('runtime_binding_id')->nullable();
            $t->unsignedInteger('catch_up_minutes')->default(60);
            $t->string('overlap', 10)->default('skip');
            $t->timestamp('next_run_at')->nullable();
            $t->timestamp('paused_at')->nullable();
            $t->timestamp('deleted_at')->nullable();
            $t->timestamps();
            $t->index(['next_run_at', 'paused_at', 'deleted_at']);
            $t->index(['user_id', 'agent_id']);
        });
        Schema::create('agent_schedule_occurrences', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('schedule_id');
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->unsignedInteger('revision');
            $t->timestamp('intended_at');
            // pending | waiting | admitted | skipped | expired | failed
            $t->string('state', 20);
            $t->string('reason', 60)->nullable();
            $t->uuid('run_id')->nullable();
            $t->timestamps();
            $t->unique(['schedule_id', 'revision', 'intended_at']);
            $t->index(['state', 'intended_at']);
        });
        Schema::create('agent_triggers', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('agent_id');
            $t->string('kind', 40);
            $t->uuid('connection_id')->nullable();
            $t->text('filter');
            $t->text('prompt_template');
            $t->unsignedInteger('rate_per_hour')->default(10);
            $t->uuid('runtime_binding_id')->nullable();
            // Encrypted webhook signing secret (GitHub: generated; Stripe: pasted whsec_).
            $t->text('secret')->nullable();
            // Poll state (Gmail `after:` time, Calendar last check). Never credentials.
            $t->text('cursor')->nullable();
            $t->timestamp('polled_at')->nullable();
            $t->string('last_error', 60)->nullable();
            $t->unsignedInteger('revision')->default(1);
            $t->timestamp('paused_at')->nullable();
            $t->timestamp('deleted_at')->nullable();
            $t->timestamps();
            $t->index(['kind', 'paused_at', 'deleted_at']);
            $t->index(['user_id', 'agent_id']);
        });
        Schema::create('agent_trigger_events', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('trigger_id');
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            // Provider event ID / delivery ID / message ID: the dedupe key.
            $t->string('event_key', 191);
            $t->string('event_type', 80)->nullable();
            $t->text('summary')->nullable();
            // admitted | skipped | failed
            $t->string('state', 20);
            $t->string('reason', 60)->nullable();
            $t->uuid('run_id')->nullable();
            $t->timestamps();
            $t->unique(['trigger_id', 'event_key']);
            $t->index(['trigger_id', 'state', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('agent_trigger_events');
        Schema::dropIfExists('agent_triggers');
        Schema::dropIfExists('agent_schedule_occurrences');
        Schema::dropIfExists('agent_schedules');
    }
};
