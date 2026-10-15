<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Live Activities: per-run APNs update tokens, the push-to-start token, and two preferences. Additive only. */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('notification_devices', function (Blueprint $t) {
            $t->text('push_to_start_token')->nullable();
            $t->string('push_to_start_hash', 64)->nullable();
            $t->timestamp('push_to_start_at')->nullable();
        });
        Schema::create('live_activity_tokens', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('device_id');
            $t->foreign('device_id')->references('id')->on('notification_devices')->cascadeOnDelete();
            $t->string('run_id', 160);
            $t->uuid('agent_id');
            // Encrypted at rest, like the Expo token; the hash finds a token without decrypting.
            $t->text('token');
            $t->string('token_hash', 64)->unique();
            $t->unsignedInteger('generation');
            $t->string('last_phase', 24)->nullable();
            $t->timestamp('last_sent_at')->nullable();
            $t->timestamp('ended_at')->nullable();
            $t->timestamp('revoked_at')->nullable();
            $t->timestamps();
            $t->unique(['device_id', 'run_id']);
            $t->index(['run_id', 'revoked_at']);
        });
        Schema::create('live_activity_preferences', function (Blueprint $t) {
            $t->foreignId('user_id')->primary()->constrained()->cascadeOnDelete();
            $t->boolean('enabled')->default(true);
            // "Show details on the lock screen": off unless the person turns it on.
            $t->boolean('details')->default(false);
            $t->unsignedInteger('revision')->default(1);
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('live_activity_preferences');
        Schema::dropIfExists('live_activity_tokens');
        Schema::table('notification_devices', fn (Blueprint $t) => $t->dropColumn(['push_to_start_token', 'push_to_start_hash', 'push_to_start_at']));
    }
};
