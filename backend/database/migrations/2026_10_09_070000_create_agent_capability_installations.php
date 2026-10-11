<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        Schema::create('agent_capability_installations', function (Blueprint $t) {
            $t->uuid('id')->primary(); $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('connection_id')->unique(); $t->string('capability_id', 100);
            $t->unsignedInteger('connection_generation'); $t->string('version', 64); $t->string('review_hash', 64);
            $t->unsignedInteger('revision'); $t->json('operations'); $t->string('request_hash', 64);
            $t->timestamp('revoked_at')->nullable(); $t->timestamps();
            $t->index(['user_id', 'capability_id']);
        });
    }
    public function down(): void { Schema::dropIfExists('agent_capability_installations'); }
};
