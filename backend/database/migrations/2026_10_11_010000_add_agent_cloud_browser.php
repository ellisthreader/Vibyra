<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agent_connections', function (Blueprint $t): void {
            $t->uuid('browser_runtime_id')->nullable()->index();
        });
        Schema::table('agent_runtime_bindings', function (Blueprint $t): void {
            $t->string('browser_key_hash', 64)->nullable();
        });
        Schema::create('agent_browser_handoffs', function (Blueprint $t): void {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('runtime_id')->index();
            $t->foreignUuid('run_id')->constrained('agent_runs')->cascadeOnDelete();
            $t->uuid('action_id')->unique();
            $t->unsignedBigInteger('generation');
            $t->unsignedBigInteger('revision')->default(1);
            $t->string('origin', 300);
            $t->string('state', 24)->default('waiting');
            $t->string('viewer_session_id', 64)->nullable();
            $t->unsignedBigInteger('frame_sequence')->default(0);
            $t->unsignedBigInteger('command_sequence')->default(0);
            $t->unsignedBigInteger('acknowledged_sequence')->default(0);
            $t->longText('frame')->nullable();
            $t->text('command')->nullable();
            $t->timestamp('expires_at')->index();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('agent_browser_handoffs');
        Schema::table('agent_runtime_bindings', fn (Blueprint $t) => $t->dropColumn('browser_key_hash'));
        Schema::table('agent_connections', fn (Blueprint $t) => $t->dropColumn('browser_runtime_id'));
    }
};
