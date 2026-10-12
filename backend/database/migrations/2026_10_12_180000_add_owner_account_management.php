<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('owner_banned_at')->nullable()->index();
            $table->unsignedBigInteger('owner_action_revision')->default(0);
            $table->unsignedBigInteger('account_session_epoch')->default(0);
        });
        Schema::create('owner_account_actions', function (Blueprint $table) {
            $table->bigIncrements('sequence');
            $table->uuid('id')->unique();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 24);
            $table->char('fingerprint', 64);
            $table->text('reason');
            $table->text('message')->nullable();
            $table->json('result');
            $table->timestamp('created_at');
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        // Operational audit records must be exported before a destructive rollback.
        throw new RuntimeException('Retain this additive migration when rolling application code back.');
    }
};
