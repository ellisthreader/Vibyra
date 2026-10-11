<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        Schema::create('agent_browser_files', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('agent_id'); $t->uuid('run_id'); $t->uuid('action_id')->unique();
            $t->foreign('agent_id')->references('id')->on('agent_teammates')->cascadeOnDelete();
            $t->foreign('run_id')->references('id')->on('agent_runs')->cascadeOnDelete();
            $t->foreign('action_id')->references('id')->on('agent_tool_actions')->cascadeOnDelete();
            $t->string('name', 120); $t->string('mime', 100); $t->unsignedInteger('size');
            $t->char('sha256', 64); $t->string('source_origin', 300); $t->longText('content');
            $t->timestamps(); $t->index(['user_id', 'agent_id', 'created_at']);
        });
    }
    public function down(): void { Schema::dropIfExists('agent_browser_files'); }
};
