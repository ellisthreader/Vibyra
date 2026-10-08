<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        Schema::table('notification_preferences', function (Blueprint $t) {
            $t->string('agent_mode', 16)->default('all'); $t->unsignedSmallInteger('agent_digest_minute')->default(540); $t->timestamp('agent_digest_checked_at')->nullable();
        });
        Schema::create('agent_signal_onboarding', function (Blueprint $t) {
            $t->foreignId('user_id')->primary()->constrained()->cascadeOnDelete();
            $t->unsignedInteger('revision')->default(1); $t->json('interests'); $t->boolean('dismissed')->default(false); $t->timestamps();
        });
        Schema::create('agent_signal_watches', function (Blueprint $t) {
            $t->uuid('id')->primary(); $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('goal_id')->nullable(); $t->foreign('goal_id')->references('id')->on('agent_work_goals')->nullOnDelete();
            $t->uuid('agent_id'); $t->foreign('agent_id')->references('id')->on('agent_teammates')->cascadeOnDelete();
            $t->uuid('connection_id'); $t->uuid('grant_id'); $t->unsignedInteger('connection_generation'); $t->unsignedInteger('grant_revision');
            $t->string('repository', 220); $t->boolean('enabled'); $t->unsignedInteger('revision');
            $t->json('observations')->nullable(); $t->timestamp('last_checked_at')->nullable(); $t->timestamp('next_check_at');
            $t->uuid('lease')->nullable(); $t->timestamp('lease_expires_at')->nullable(); $t->string('error', 50)->nullable();
            $t->timestamps(); $t->index(['enabled','next_check_at']); $t->index(['user_id','agent_id']);
        });
        Schema::create('agent_signal_findings', function (Blueprint $t) {
            $t->uuid('id')->primary(); $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('watch_id'); $t->foreign('watch_id')->references('id')->on('agent_signal_watches')->cascadeOnDelete();
            $t->uuid('goal_id')->nullable(); $t->foreign('goal_id')->references('id')->on('agent_work_goals')->nullOnDelete();
            $t->uuid('agent_id'); $t->unsignedInteger('watch_revision'); $t->string('fingerprint',64)->unique();
            $t->string('kind',30); $t->string('title',160); $t->json('source'); $t->json('evidence');
            $t->timestamp('observed_at'); $t->timestamp('source_updated_at'); $t->timestamp('expires_at'); $t->timestamp('dismissed_at')->nullable();
            $t->index(['user_id','agent_id','observed_at']);
        });
        Schema::create('agent_signal_digest_items', function (Blueprint $t) {
            $t->uuid('item_id')->primary(); $t->foreign('item_id')->references('id')->on('notification_items')->cascadeOnDelete();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete(); $t->timestamp('created_at'); $t->date('due_date'); $t->uuid('digest_id')->nullable();
            $t->timestamp('discarded_at')->nullable(); $t->index(['user_id','digest_id']);
        });
        Schema::create('agent_signal_digests', function (Blueprint $t) {
            $t->uuid('id')->primary(); $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->date('local_date'); $t->string('timezone',80); $t->uuid('notification_id')->nullable(); $t->timestamp('created_at');
            $t->unique(['user_id','local_date']);
        });
    }
    public function down(): void
    {
        foreach (['agent_signal_digests','agent_signal_digest_items','agent_signal_findings','agent_signal_watches','agent_signal_onboarding'] as $table) Schema::dropIfExists($table);
        Schema::table('notification_preferences', fn (Blueprint $t) => $t->dropColumn(['agent_mode','agent_digest_minute','agent_digest_checked_at']));
    }
};
