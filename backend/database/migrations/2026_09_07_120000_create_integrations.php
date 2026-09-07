<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('integration_connections', function (Blueprint $t): void {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('service', 40);
            $t->string('external_id', 191);
            $t->string('shop_host', 100)->nullable()->unique();
            $t->string('label');
            $t->string('environment', 20)->default('live');
            $t->string('status', 24)->default('connected');
            $t->text('credentials');
            $t->timestamp('authorized_at');
            $t->timestamp('expires_at')->nullable();
            $t->timestamps();
            $t->unique(['user_id', 'service', 'external_id', 'environment'], 'integration_identity');
        });
        Schema::create('integration_attempts', function (Blueprint $t): void {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->foreignId('session_id')->constrained('vibyra_sessions')->cascadeOnDelete();
            $t->string('service', 40);
            $t->string('state_hash', 64)->unique();
            $t->string('status', 24)->default('pending');
            $t->text('payload');
            $t->uuid('connection_id')->nullable();
            $t->timestamp('expires_at');
            $t->timestamps();
        });
        Schema::create('integration_grants', function (Blueprint $t): void {
            $t->id();
            $t->uuid('connection_id');
            $t->foreign('connection_id')->references('id')->on('integration_connections')->cascadeOnDelete();
            $t->string('device', 128);
            $t->string('agent', 128);
            $t->unique(['connection_id', 'device', 'agent'], 'integration_agent_grant');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('integration_grants');
        Schema::dropIfExists('integration_attempts');
        Schema::dropIfExists('integration_connections');
    }
};
