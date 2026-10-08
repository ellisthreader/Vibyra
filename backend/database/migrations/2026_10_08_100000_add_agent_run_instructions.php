<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('agent_runs', function (Blueprint $table) {
            $table->unsignedInteger('instruction_revision')->default(0);
            $table->unsignedInteger('applied_instruction_revision')->default(0);
        });
        Schema::table('agent_tool_actions', fn (Blueprint $table) => $table->unsignedInteger('instruction_revision')->default(0));
        Schema::create('agent_run_instructions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('run_id')->index();
            $table->unsignedInteger('revision');
            $table->uuid('idempotency_key');
            $table->unsignedInteger('expected_revision');
            $table->text('text');
            $table->timestamp('created_at');
            $table->unique(['run_id', 'revision']);
            $table->unique(['run_id', 'idempotency_key']);
            $table->foreign('run_id')->references('id')->on('agent_runs')->cascadeOnDelete();
        });
    }
    public function down(): void
    {
        Schema::dropIfExists('agent_run_instructions');
        Schema::table('agent_tool_actions', fn (Blueprint $table) => $table->dropColumn('instruction_revision'));
        Schema::table('agent_runs', fn (Blueprint $table) => $table->dropColumn(['instruction_revision', 'applied_instruction_revision']));
    }
};
