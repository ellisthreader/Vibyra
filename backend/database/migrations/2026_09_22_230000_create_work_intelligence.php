<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        Schema::table('vibes_turns', fn (Blueprint $t) => $t->string('finish_reason', 40)->nullable());
        Schema::create('work_events', function (Blueprint $t) {
            $t->id(); $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('source', 40); $t->string('run_id', 160); $t->string('fingerprint', 64)->unique();
            $t->string('phase', 40); $t->json('metadata'); $t->timestamp('created_at');
            $t->timestamp('published_at')->nullable(); $t->index(['user_id', 'id']); $t->index(['published_at', 'id']);
        });
        Schema::create('work_progress', function (Blueprint $t) {
            $t->id(); $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('source', 40); $t->string('run_id', 160); $t->unsignedBigInteger('event_id');
            $t->string('phase', 40); $t->json('metadata'); $t->json('assessment')->nullable();
            $t->timestamp('observed_at'); $t->unique(['source', 'run_id']);
        });
        Schema::create('notification_preferences', function (Blueprint $t) {
            $t->foreignId('user_id')->primary()->constrained()->cascadeOnDelete();
            $t->unsignedInteger('revision')->default(1); $t->boolean('attention')->default(true);
            $t->boolean('replies')->default(true); $t->boolean('smart')->default(false);
            $t->boolean('advisories')->default(false); $t->string('timezone')->default('UTC');
            $t->unsignedSmallInteger('quiet_start')->nullable(); $t->unsignedSmallInteger('quiet_end')->nullable();
            $t->timestamp('activated_at');
        });
        Schema::create('notification_devices', function (Blueprint $t) {
            $t->uuid('id')->primary(); $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->unsignedBigInteger('session_id'); $t->uuid('installation'); $t->string('proof_hash', 64);
            $t->text('token'); $t->string('token_hash', 64)->unique(); $t->unsignedInteger('generation')->default(1);
            $t->string('environment', 20); $t->timestamp('revoked_at')->nullable();
            $t->string('visible_run', 160)->nullable(); $t->timestamp('present_until')->nullable();
            $t->timestamps(); $t->unique(['user_id', 'installation']);
        });
        Schema::create('notification_items', function (Blueprint $t) {
            $t->uuid('id')->primary(); $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->unsignedBigInteger('event_id')->unique(); $t->string('category', 30);
            $t->string('title', 120); $t->json('destination'); $t->timestamp('created_at');
            $t->timestamp('expires_at'); $t->timestamp('read_at')->nullable(); $t->index(['user_id', 'created_at']);
        });
        Schema::create('notification_deliveries', function (Blueprint $t) {
            $t->id(); $t->uuid('item_id'); $t->uuid('device_id'); $t->unsignedInteger('generation');
            $t->string('state', 24)->default('pending'); $t->unsignedInteger('attempts')->default(0);
            $t->string('ticket')->nullable(); $t->string('error', 80)->nullable();
            $t->timestamp('next_at'); $t->timestamp('claimed_at')->nullable(); $t->timestamps();
            $t->unique(['item_id', 'device_id']); $t->index(['state', 'next_at']);
        });
        Schema::create('ai_decisions', function (Blueprint $t) {
            $t->uuid('id')->primary(); $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('purpose', 24); $t->string('fingerprint', 64); $t->string('state', 24)->default('pending');
            $t->text('input')->nullable(); $t->text('result')->nullable(); $t->string('reason', 60)->nullable();
            $t->unsignedBigInteger('usage_micro_usd')->nullable(); $t->string('model', 80)->nullable(); $t->unsignedInteger('rubric')->default(1);
            $t->timestamp('deadline'); $t->timestamp('claimed_at')->nullable(); $t->timestamps();
            $t->index(['user_id', 'created_at']); $t->index(['state', 'deadline']);
        });
    }
    public function down(): void
    {
        foreach (['ai_decisions','notification_deliveries','notification_items','notification_devices',
            'notification_preferences','work_progress','work_events'] as $table) Schema::dropIfExists($table);
        Schema::table('vibes_turns', fn (Blueprint $t) => $t->dropColumn('finish_reason'));
    }
};
