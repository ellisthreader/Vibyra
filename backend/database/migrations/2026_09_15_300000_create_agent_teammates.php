<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('agent_teammates', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('chat_id')->unique();
            $t->string('name', 80);
            $t->string('avatar', 30);
            $t->text('brief');
            $t->text('memory');
            $t->text('integrations');
            $t->unsignedInteger('budget')->default(10);
            $t->unsignedInteger('revision')->default(1);
            $t->string('create_hash', 64);
            $t->timestamp('archived_at')->nullable();
            $t->timestamps();
            $t->index(['user_id', 'archived_at']);
        });
        Schema::table('vibes_chats', fn (Blueprint $t) => $t->uuid('agent_id')->nullable()->index());
        Schema::table('vibes_tools', function (Blueprint $t) {
            $t->string('action_state', 20)->nullable();
            $t->string('action_hash', 64)->nullable();
            $t->string('action_answer', 10)->nullable();
            $t->timestamp('action_dispatched_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('vibes_tools', fn (Blueprint $t) => $t->dropColumn(['action_state', 'action_hash', 'action_answer', 'action_dispatched_at']));
        Schema::table('vibes_chats', fn (Blueprint $t) => $t->dropColumn('agent_id'));
        Schema::dropIfExists('agent_teammates');
    }
};
