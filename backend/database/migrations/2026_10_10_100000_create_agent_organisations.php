<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        Schema::create('agent_organisation_policies', function (Blueprint $t) {
            $t->uuid('organization_id')->primary();
            $t->foreign('organization_id')->references('id')->on('organizations')->cascadeOnDelete();
            $t->unsignedInteger('revision')->default(1); $t->boolean('enabled')->default(false);
            $t->json('allowed_providers'); $t->unsignedInteger('daily_task_limit')->default(25);
            $t->unsignedInteger('retention_days')->default(90); $t->string('request_hash', 64)->nullable(); $t->timestamps();
        });
        Schema::create('agent_organisation_definitions', function (Blueprint $t) {
            $t->uuid('id')->primary(); $t->uuid('organization_id')->index();
            $t->foreign('organization_id')->references('id')->on('organizations')->cascadeOnDelete();
            $t->unsignedInteger('revision'); $t->timestamp('retired_at')->nullable(); $t->timestamps();
        });
        Schema::create('agent_organisation_versions', function (Blueprint $t) {
            $t->id(); $t->uuid('definition_id'); $t->unsignedInteger('revision');
            $t->foreign('definition_id')->references('id')->on('agent_organisation_definitions')->cascadeOnDelete();
            $t->string('name', 80); $t->string('avatar', 100); $t->text('instructions'); $t->text('knowledge');
            $t->string('review_hash', 64); $t->unsignedBigInteger('author_id'); $t->timestamp('created_at');
            $t->unique(['definition_id', 'revision']);
        });
        Schema::create('agent_organisation_instances', function (Blueprint $t) {
            $t->uuid('agent_id')->primary(); $t->uuid('organization_id')->index(); $t->uuid('definition_id');
            $t->foreign('agent_id')->references('id')->on('agent_teammates')->cascadeOnDelete();
            $t->unsignedBigInteger('user_id')->index(); $t->unsignedBigInteger('member_id');
            $t->unsignedInteger('revision'); $t->timestamps(); $t->unique(['definition_id', 'member_id']);
        });
        Schema::create('agent_organisation_runs', function (Blueprint $t) {
            $t->uuid('run_id')->primary(); $t->foreign('run_id')->references('id')->on('agent_runs')->cascadeOnDelete();
            $t->uuid('organization_id'); $t->uuid('definition_id'); $t->unsignedInteger('definition_revision');
            $t->unsignedBigInteger('user_id'); $t->unsignedBigInteger('member_id'); $t->unsignedInteger('policy_revision');
            $t->json('allowed_providers'); $t->uuid('runtime_id'); $t->string('runtime_hash', 64);
            $t->timestamp('created_at'); $t->timestamp('content_cleared_at')->nullable();
            $t->index(['organization_id', 'user_id', 'created_at'], 'agent_org_run_daily');
        });
        Schema::create('agent_organisation_audit', function (Blueprint $t) {
            $t->bigIncrements('id'); $t->uuid('organization_id')->index(); $t->unsignedBigInteger('actor_id');
            $t->string('event', 60); $t->uuid('definition_id')->nullable(); $t->unsignedInteger('revision')->nullable();
            $t->timestamp('created_at');
        });
    }
    public function down(): void
    {
        foreach (['audit', 'runs', 'instances', 'versions', 'definitions', 'policies'] as $part)
            Schema::dropIfExists('agent_organisation_'.$part);
    }
};
