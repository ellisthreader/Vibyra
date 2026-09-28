<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('membership_cancellation_feedback', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('plan', 32);
            $table->string('billing_cycle', 16);
            $table->string('billing_provider', 32)->nullable();
            $table->string('reason', 48);
            $table->text('details')->nullable();
            $table->string('status', 32);
            $table->timestamp('confirmed_at');
            $table->timestamp('completed_at')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'created_at']);
            $table->index(['reason', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('membership_cancellation_feedback');
    }
};
