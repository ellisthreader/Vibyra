<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cloud switching (docs/cloud-switching-contract.md section 1): who writes a conversation, the PC or Vibyra Cloud.
 * No row means `pc`. `generation` is the compare-and-set counter (0 = never moved); only metadata is stored,
 * never message content. Rows go with the account and with "Disconnect Vibyra Cloud".
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('cloud_conversation_owners', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('provider', 16);
            $t->string('agent_session_id', 100);
            $t->string('project', 64);
            $t->string('owner', 8)->default('pc');
            $t->unsignedInteger('generation')->default(0);
            $t->string('title', 200)->nullable();
            $t->timestamps();
            $t->unique(['user_id', 'provider', 'agent_session_id']);
            $t->index(['user_id', 'project']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cloud_conversation_owners');
    }
};
