<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        Schema::create('agent_browser_workflows', function (Blueprint $t) {
            $t->uuid('id')->primary(); $t->foreignId('user_id')->constrained()->cascadeOnDelete(); $t->uuid('agent_id');
            $t->uuid('source_run_id'); $t->uuid('connection_id'); $t->text('runtime_snapshot'); $t->json('grant_snapshot');
            $t->string('name', 100); $t->unsignedInteger('revision'); $t->text('steps'); $t->string('review_hash', 64);
            $t->string('request_hash', 64); $t->uuid('test_run_id')->nullable(); $t->uuid('skill_id')->nullable(); $t->timestamps();
            $t->index(['user_id', 'agent_id']);
        });
        Schema::create('agent_browser_workflow_tests', function (Blueprint $t) {
            $t->uuid('run_id')->primary(); $t->foreign('run_id')->references('id')->on('agent_runs')->cascadeOnDelete();
            $t->uuid('workflow_id'); $t->unsignedInteger('revision'); $t->text('context'); $t->timestamps();
        });
    }
    public function down(): void { Schema::dropIfExists('agent_browser_workflow_tests'); Schema::dropIfExists('agent_browser_workflows'); }
};
