<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('agent_workspaces', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('agent_id');
            $t->foreign('agent_id')->references('id')->on('agent_teammates')->cascadeOnDelete();
            $t->string('host_id', 64);
            $t->string('label', 80);
            $t->string('runner_key_hash', 64);
            $t->unsignedInteger('revision')->default(1);
            $t->timestamp('revoked_at')->nullable();
            $t->timestamp('last_seen_at')->nullable();
            $t->timestamps();
            $t->index(['user_id', 'host_id', 'revoked_at']);
        });
        Schema::table('vibes_tools', fn (Blueprint $t) => $t->uuid('agent_workspace_id')->nullable()->index());
    }

    public function down(): void
    {
        Schema::table('vibes_tools', fn (Blueprint $t) => $t->dropColumn('agent_workspace_id'));
        Schema::dropIfExists('agent_workspaces');
    }
};
