<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('cloud_workspace_control', function (Blueprint $t) {
            $t->unsignedInteger('id')->primary();
            $t->timestamp('provider_audited_at')->nullable();
            $t->boolean('admission_blocked')->default(true);
            $t->string('audit_reason', 100)->nullable();
            $t->timestamps();
        });
        \Illuminate\Support\Facades\DB::table('cloud_workspace_control')->insert(['id' => 1]);
        Schema::create('cloud_workspaces', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->restrictOnDelete();
            $t->string('name', 120);
            $t->string('project_id', 150);
            $t->string('state', 32)->default('draft');
            $t->unsignedBigInteger('revision')->default(0);
            $t->unsignedInteger('generation')->default(0);
            $t->uuid('chat_id')->nullable()->unique();
            $t->unsignedBigInteger('device_id')->nullable();
            $t->unsignedBigInteger('device_generation')->nullable();
            $t->unsignedBigInteger('app_session_id')->nullable();
            $t->string('region', 16)->nullable();
            $t->string('app_name', 63)->unique();
            $t->string('machine_id', 80)->nullable();
            $t->string('volume_id', 80)->nullable();
            $t->uuid('operation_id')->nullable();
            $t->string('tariff_version', 100)->nullable();
            $t->unsignedBigInteger('units_per_hour')->default(0);
            $t->unsignedBigInteger('provider_micro_per_hour')->default(0);
            $t->unsignedBigInteger('budget_units')->default(0);
            $t->unsignedBigInteger('runtime_charged_units')->default(0);
            $t->unsignedBigInteger('runtime_numerator')->default(0);
            $t->unsignedBigInteger('provider_numerator')->default(0);
            $t->timestamp('metered_at')->nullable();
            $t->timestamp('ready_at')->nullable();
            $t->timestamp('heartbeat_at')->nullable();
            $t->timestamp('lease_until')->nullable();
            $t->timestamp('deadline_at')->nullable();
            $t->timestamp('stop_requested_at')->nullable();
            $t->timestamp('last_activity_at')->nullable();
            $t->timestamp('retention_until')->nullable();
            $t->text('bootstrap_secret')->nullable();
            $t->string('runtime_token_hash', 64)->nullable();
            $t->text('runtime_secret')->nullable();
            $t->timestamp('bootstrapped_at')->nullable();
            $t->string('base_checkpoint', 64)->nullable();
            $t->string('checkpoint', 64)->nullable();
            $t->timestamp('checkpoint_at')->nullable();
            $t->boolean('unsaved_possible')->default(false);
            $t->string('stop_reason', 100)->nullable();
            $t->timestamps();
            $t->index(['user_id', 'state']);
        });
        Schema::table('vibes_chats', fn (Blueprint $t) => $t->uuid('cloud_workspace_id')->nullable()->unique());
        Schema::create('cloud_quotes', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('workspace_id')->index();
            $t->unsignedBigInteger('user_id');
            $t->text('payload');
            $t->uuid('challenge_id');
            $t->timestamp('expires_at');
            $t->timestamp('accepted_at')->nullable();
            $t->string('accepted_proof_hash', 64)->nullable();
            $t->timestamps();
        });
        Schema::create('cloud_reservations', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->unsignedBigInteger('user_id')->index();
            $t->uuid('workspace_id')->index();
            $t->unsignedInteger('generation');
            $t->unsignedBigInteger('reserved');
            $t->string('tariff_version', 100)->nullable();
            $t->unsignedBigInteger('units_per_hour')->default(0);
            $t->unsignedBigInteger('provider_micro_per_hour')->default(0);
            $t->timestamp('metered_from')->nullable();
            $t->timestamp('metered_to')->nullable();
            $t->unsignedInteger('billed_seconds')->default(0);
            $t->unsignedBigInteger('charged')->default(0);
            $t->unsignedBigInteger('actual_micro_usd')->default(0);
            $t->text('allocations');
            $t->timestamp('settled_at')->nullable();
            $t->timestamps();
            $t->index(['user_id', 'settled_at']);
        });
        Schema::create('cloud_actions', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('workspace_id')->index();
            $t->unsignedInteger('generation');
            $t->string('operation', 40);
            $t->string('state', 24)->default('queued');
            $t->string('digest', 64);
            $t->text('arguments');
            $t->text('result')->nullable();
            $t->uuid('tool_id')->nullable()->unique();
            $t->timestamp('claimed_at')->nullable();
            $t->timestamp('expires_at');
            $t->timestamps();
            $t->index(['workspace_id', 'generation', 'state']);
        });
        Schema::create('cloud_checkpoints', function (Blueprint $t) {
            $t->bigIncrements('id');
            $t->uuid('workspace_id');
            $t->unsignedInteger('generation');
            $t->string('hash', 64);
            $t->string('object_key', 255);
            $t->unsignedBigInteger('bytes');
            $t->timestamp('created_at');
            $t->unique(['workspace_id', 'hash']);
        });
        Schema::create('cloud_preview_tickets', function (Blueprint $t) {
            $t->string('hash', 64)->primary(); $t->uuid('workspace_id')->index(); $t->unsignedInteger('generation');
            $t->unsignedBigInteger('device_id'); $t->unsignedBigInteger('device_generation'); $t->unsignedBigInteger('session_id');
            $t->unsignedInteger('port'); $t->timestamp('expires_at'); $t->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['cloud_preview_tickets', 'cloud_checkpoints', 'cloud_actions', 'cloud_reservations', 'cloud_quotes'] as $table) Schema::dropIfExists($table);
        Schema::table('vibes_chats', fn (Blueprint $t) => $t->dropColumn('cloud_workspace_id'));
        Schema::dropIfExists('cloud_workspaces');
        Schema::dropIfExists('cloud_workspace_control');
    }
};
