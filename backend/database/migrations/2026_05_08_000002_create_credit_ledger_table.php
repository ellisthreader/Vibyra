<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('credit_ledger', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // 'chat', 'agent', 'topup', 'refresh', 'refund'
            $table->string('kind', 16);
            $table->string('model_key', 64)->nullable();
            $table->string('model_slug', 96)->nullable();
            // OpenRouter raw cost in microdollars (USD * 1_000_000) for precision.
            $table->unsignedBigInteger('openrouter_micro_usd')->default(0);
            $table->unsignedInteger('input_tokens')->default(0);
            $table->unsignedInteger('output_tokens')->default(0);
            // multiplier_x100 = round(applied_multiplier * 100). 100 means 1.0x.
            $table->unsignedSmallInteger('multiplier_x100')->default(100);
            // Signed credits delta. Negative for spend, positive for grants/refunds.
            $table->integer('credits_delta');
            $table->unsignedInteger('credits_balance_after');
            $table->string('reference', 96)->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'created_at']);
            $table->index(['user_id', 'kind']);
            $table->unique(['user_id', 'reference']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('credit_ledger');
    }
};
