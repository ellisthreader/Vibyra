<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('agent_runtime_bindings', function (Blueprint $t) {
            $t->string('execution_target', 10)->default('local');
            $t->uuid('cloud_workspace_id')->nullable()->index();
            $t->unsignedInteger('cloud_generation')->nullable();
        });
        Schema::create('agent_cloud_quotes', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('workspace_id');
            $t->unsignedBigInteger('session_id');
            $t->string('device_id', 128);
            $t->text('payload');
            $t->timestamp('expires_at');
            $t->timestamp('accepted_at')->nullable();
            $t->timestamp('created_at');
        });
        Schema::create('agent_cloud_accounts', function (Blueprint $t) {
            $t->uuid('workspace_id')->primary();
            $t->foreign('workspace_id')->references('id')->on('cloud_workspaces')->cascadeOnDelete();
            $t->unsignedInteger('generation');
            $t->text('accounts');
            $t->timestamp('reported_at');
        });
        Schema::create('agent_cloud_policies', function (Blueprint $t) {
            $t->foreignId('user_id')->primary()->constrained()->cascadeOnDelete();
            $t->uuid('workspace_id');
            $t->uuid('runtime_binding_id')->unique();
            $t->unsignedBigInteger('session_id');
            $t->string('device_id', 128);
            $t->text('quote');
            $t->unsignedInteger('max_starts');
            $t->unsignedInteger('used_starts')->default(0);
            $t->unsignedBigInteger('total_budget_units');
            $t->unsignedBigInteger('reserved_budget_units')->default(0);
            $t->unsignedInteger('total_seconds');
            $t->unsignedInteger('reserved_seconds')->default(0);
            $t->unsignedInteger('revision')->default(1);
            $t->timestamp('expires_at');
            $t->timestamp('revoked_at')->nullable();
            $t->timestamp('last_attempt_at')->nullable();
            $t->timestamps();
        });
    }
    public function down(): void
    {
        Schema::dropIfExists('agent_cloud_policies');
        Schema::dropIfExists('agent_cloud_accounts');
        Schema::dropIfExists('agent_cloud_quotes');
        Schema::table('agent_runtime_bindings', fn (Blueprint $t) => $t->dropColumn(['execution_target', 'cloud_workspace_id', 'cloud_generation']));
    }
};
