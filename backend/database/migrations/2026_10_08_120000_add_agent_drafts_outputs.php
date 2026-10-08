<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('agent_tool_actions', fn (Blueprint $t) => $t->unsignedInteger('draft_revision')->default(1));
        Schema::create('agent_draft_revisions', function (Blueprint $t) {
            $t->id();
            $t->uuid('action_id');
            $t->unsignedInteger('revision');
            $t->text('arguments');
            $t->string('fingerprint', 64);
            $t->timestamp('created_at');
            $t->unique(['action_id', 'revision']);
            $t->foreign('action_id')->references('id')->on('agent_tool_actions')->cascadeOnDelete();
        });
        Schema::create('agent_output_quotas', function (Blueprint $t) {
            $t->uuid('agent_id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->unsignedInteger('count')->default(0);
            $t->foreign('agent_id')->references('id')->on('agent_teammates')->cascadeOnDelete();
        });
        Schema::create('agent_outputs', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('agent_id');
            $t->uuid('run_id');
            $t->string('kind', 20);
            $t->string('title', 160);
            $t->unsignedInteger('revision');
            $t->text('content');
            $t->text('sources');
            $t->timestamps();
            $t->index(['user_id', 'agent_id', 'updated_at']);
            $t->foreign('agent_id')->references('id')->on('agent_teammates')->cascadeOnDelete();
        });
        Schema::create('agent_output_revisions', function (Blueprint $t) {
            $t->id();
            $t->uuid('output_id');
            $t->uuid('run_id');
            $t->unsignedInteger('revision');
            $t->string('title', 160);
            $t->text('content');
            $t->text('sources');
            $t->string('author', 12);
            $t->timestamp('created_at');
            $t->unique(['output_id', 'revision']);
            $t->foreign('output_id')->references('id')->on('agent_outputs')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('agent_output_revisions');
        Schema::dropIfExists('agent_outputs');
        Schema::dropIfExists('agent_output_quotas');
        Schema::dropIfExists('agent_draft_revisions');
        Schema::table('agent_tool_actions', fn (Blueprint $t) => $t->dropColumn('draft_revision'));
    }
};
