<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vibes_wallets', function (Blueprint $t) {
            $t->foreignId('user_id')->primary()->constrained()->cascadeOnDelete();
            $t->uuid('account_token')->unique();
            $t->string('plan')->default('free');
            $t->timestamp('paid_until')->nullable();
            $t->timestamp('consented_at')->nullable();
            $t->timestamps();
        });
        Schema::create('vibes_grants', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('reference')->unique();
            $t->string('kind');
            $t->integer('amount');
            $t->integer('remaining');
            $t->timestamp('revoked_at')->nullable();
            $t->timestamps();
        });
        Schema::create('vibes_chats', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('title');
            $t->unsignedTinyInteger('trial_slot')->nullable();
            $t->integer('trial_used')->default(0);
            $t->integer('revision')->default(0);
            $t->string('host_id')->nullable();
            $t->string('project_id')->nullable();
            $t->string('binding')->nullable();
            $t->timestamps();
            $t->unique(['user_id', 'trial_slot']);
        });
        Schema::create('vibes_turns', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('chat_id');
            $t->foreign('chat_id')->references('id')->on('vibes_chats')->cascadeOnDelete();
            $t->string('digest', 64);
            $t->string('model');
            $t->string('status')->index();
            $t->json('request');
            $t->json('allocations');
            $t->text('prompt');
            $t->longText('response')->nullable();
            $t->string('error')->nullable();
            $t->string('generation_id')->nullable();
            $t->integer('reserved');
            $t->integer('charged')->default(0);
            $t->integer('step_count')->default(0);
            $t->bigInteger('actual_micro_usd')->default(0);
            $t->boolean('cancel_requested')->default(false);
            $t->timestamp('dispatched_at')->nullable();
            $t->timestamp('settled_at')->nullable();
            $t->timestamps();
        });
        Schema::create('vibes_tools', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('turn_id');
            $t->foreign('turn_id')->references('id')->on('vibes_turns')->cascadeOnDelete();
            $t->string('provider_id');
            $t->string('operation');
            $t->json('arguments');
            $t->string('decision')->nullable();
            $t->json('result')->nullable();
            $t->timestamps();
        });
        Schema::create('vibes_ledger', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('reference')->unique();
            $t->string('kind');
            $t->integer('delta');
            $t->json('metadata')->nullable();
            $t->timestamp('created_at');
        });
        Schema::create('vibes_spend_days', function (Blueprint $t) {
            $t->date('day')->primary();
            $t->bigInteger('held')->default(0);
            $t->bigInteger('spent')->default(0);
        });
        Schema::create('vibes_purchases', function (Blueprint $t) {
            $t->string('transaction_id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('original_id')->index();
            $t->string('product_id');
            $t->timestamp('purchased_at');
            $t->unsignedInteger('granted_credits')->default(0);
            $t->timestamp('expires_at')->nullable();
            $t->timestamp('revoked_at')->nullable();
            $t->timestamp('created_at');
        });
    }

    public function down(): void
    {
        foreach (['purchases', 'spend_days', 'ledger', 'tools', 'turns', 'chats', 'grants', 'wallets'] as $table) {
            Schema::dropIfExists('vibes_'.$table);
        }
    }
};
