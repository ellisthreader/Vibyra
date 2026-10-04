<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Roadmap Part 11: personal API keys (SHA-256 of the secret only) and outbound webhooks (endpoint secret encrypted so it
 * can sign; deliveries are the log, unique per endpoint and event so a retried emit never sends twice).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('api_keys', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('name', 60);
            $t->string('prefix', 14);
            $t->char('key_hash', 64)->unique();
            $t->json('scopes');
            $t->unsignedSmallInteger('rate_per_minute')->default(60);
            $t->timestamp('last_used_at')->nullable();
            $t->timestamp('revoked_at')->nullable();
            $t->timestamps();
            $t->index(['user_id', 'revoked_at']);
        });
        Schema::create('webhook_endpoints', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('url', 500);
            $t->text('secret');
            $t->json('events');
            $t->unsignedSmallInteger('failures')->default(0);
            $t->timestamp('paused_at')->nullable();
            $t->string('paused_reason', 40)->nullable();
            $t->timestamp('deleted_at')->nullable();
            $t->timestamps();
            $t->index(['user_id', 'deleted_at']);
        });
        Schema::create('webhook_deliveries', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('endpoint_id');
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('event', 40);
            $t->string('event_key', 120);
            $t->json('payload');
            $t->string('state', 12)->default('pending');
            $t->unsignedSmallInteger('attempts')->default(0);
            $t->timestamp('next_attempt_at')->nullable();
            $t->unsignedSmallInteger('response_status')->nullable();
            $t->string('error', 40)->nullable();
            $t->timestamp('delivered_at')->nullable();
            $t->timestamp('created_at');
            $t->foreign('endpoint_id')->references('id')->on('webhook_endpoints')->cascadeOnDelete();
            $t->unique(['endpoint_id', 'event_key']);
            $t->index(['endpoint_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('webhook_deliveries');
        Schema::dropIfExists('webhook_endpoints');
        Schema::dropIfExists('api_keys');
    }
};
