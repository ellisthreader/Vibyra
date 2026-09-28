<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chat_cost_reservations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('reference', 120);
            $table->enum('status', ['pending', 'settling', 'settled', 'released', 'expired'])->default('pending');
            $table->string('model_key', 80);
            $table->string('model_slug', 120);
            $table->unsignedInteger('reserved_credits');
            $table->unsignedBigInteger('reserved_micro_usd');
            $table->unsignedInteger('actual_credits')->nullable();
            $table->unsignedBigInteger('actual_micro_usd')->nullable();
            $table->unsignedInteger('input_tokens')->nullable();
            $table->unsignedInteger('output_tokens')->nullable();
            $table->json('attempts')->nullable();
            $table->json('meta')->nullable();
            $table->timestamp('expires_at');
            $table->timestamp('provider_started_at')->nullable();
            $table->timestamp('settled_at')->nullable();
            $table->timestamp('released_at')->nullable();
            $table->string('release_reason', 120)->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'reference']);
            $table->index(['status', 'expires_at']);
            $table->index(['user_id', 'status']);
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chat_cost_reservations');
    }
};
