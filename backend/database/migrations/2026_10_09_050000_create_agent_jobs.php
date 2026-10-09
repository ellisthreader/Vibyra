<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('agent_job_accounts', function (Blueprint $table) {
            $table->foreignId('user_id')->primary()->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('write_epoch')->default(0);
        });
        Schema::create('agent_run_jobs', function (Blueprint $table) {
            $table->uuid('run_id')->primary();
            $table->foreign('run_id')->references('id')->on('agent_runs')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('mode', 20);
            $table->unsignedBigInteger('slot_generation')->nullable();
            $table->unsignedBigInteger('write_epoch')->default(0);
            $table->text('context')->nullable();
            $table->timestamps();
        });
        Schema::create('agent_runtime_slots', function (Blueprint $table) {
            $table->uuid('binding_id');
            $table->unsignedTinyInteger('slot');
            $table->uuid('run_id')->nullable();
            $table->unsignedBigInteger('generation')->default(0);
            $table->primary(['binding_id', 'slot']);
            $table->foreign('binding_id')->references('id')->on('agent_runtime_bindings')->cascadeOnDelete();
            $table->index('run_id');
        });
        Schema::create('agent_job_resources', function (Blueprint $table) {
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('resource_hash', 64);
            $table->unsignedBigInteger('write_epoch')->default(0);
            $table->uuid('run_id')->nullable();
            $table->uuid('action_id')->nullable();
            $table->primary(['user_id', 'resource_hash']);
        });
    }

    public function down(): void
    {
        foreach (['agent_job_resources', 'agent_runtime_slots', 'agent_run_jobs', 'agent_job_accounts'] as $table)
            Schema::dropIfExists($table);
    }
};
