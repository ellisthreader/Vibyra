<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('agent_work_proposals', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('agent_id')->index();
            $t->uuid('run_id')->index();
            $t->uuid('runtime_id');
            $t->json('runtime_snapshot');
            $t->string('kind', 20);
            $t->text('spec');
            $t->unsignedInteger('revision')->default(1);
            $t->string('status', 20)->default('draft');
            $t->timestamp('expires_at');
            $t->unsignedInteger('accepted_revision')->nullable();
            $t->string('accepted_hash', 64)->nullable();
            $t->json('activation')->nullable();
            $t->timestamps();
            $t->index(['user_id', 'status', 'created_at']);
        });
        Schema::create('agent_work_proposal_quotas', function (Blueprint $t) {
            $t->uuid('agent_id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->unsignedInteger('count')->default(0);
        });
        Schema::create('agent_run_skill_snapshots', function (Blueprint $t) {
            $t->uuid('run_id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->text('skills');
            $t->timestamp('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('agent_run_skill_snapshots');
        Schema::dropIfExists('agent_work_proposal_quotas');
        Schema::dropIfExists('agent_work_proposals');
    }
};
