<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('apple_account_revocations', function (Blueprint $table) {
            $table->id();
            // Deliberately survives account deletion; does not reference email, name or identity token.
            $table->unsignedBigInteger('user_id')->unique();
            $table->text('payload')->nullable();
            $table->string('status', 20);
            $table->unsignedInteger('attempts')->default(0);
            $table->string('last_error', 80)->nullable();
            $table->timestamp('next_attempt_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'next_attempt_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('apple_account_revocations');
    }
};
