<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('agent_memories', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('agent_id');
            $t->string('account_scope', 64);
            $t->string('key', 100);
            $t->text('fact');
            $t->string('fingerprint', 64);
            $t->string('source_kind', 20);
            $t->string('source_label', 160);
            $t->uuid('source_run_id')->nullable();
            $t->string('status', 20);
            $t->unsignedInteger('revision')->default(1);
            $t->timestamp('expires_at')->nullable();
            $t->timestamp('invalidated_at')->nullable();
            $t->timestamps();
            $t->index(['user_id', 'agent_id', 'account_scope', 'status'], 'agent_memory_scope');
            $t->index(['agent_id', 'fingerprint']);
        });
    }

    public function down(): void { Schema::dropIfExists('agent_memories'); }
};
