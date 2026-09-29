<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('security_events', function (Blueprint $table): void {
            $table->id(); $table->uuid('uuid')->unique();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('desktop_id')->nullable();
            $table->unsignedBigInteger('trusted_device_id')->nullable();
            $table->unsignedBigInteger('remote_session_id')->nullable();
            $table->string('event_type', 64);
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 255)->nullable();
            $table->json('metadata'); $table->timestamp('created_at'); $table->timestamp('read_at')->nullable();
            $table->index(['user_id', 'created_at']);
        });
        Schema::create('security_event_deliveries', function (Blueprint $table): void {
            $table->id(); $table->foreignId('security_event_id')->constrained('security_events')->cascadeOnDelete();
            $table->string('channel', 10); $table->string('recipient', 64);
            $table->unsignedInteger('generation')->default(0);
            $table->string('status', 20)->default('pending');
            $table->timestamp('accepted_at')->nullable(); $table->timestamp('created_at');
            $table->timestamp('claimed_at')->nullable(); $table->uuid('claim_id')->nullable();
            $table->timestamp('next_attempt_at')->nullable();
            $table->unsignedInteger('attempts')->default(0);
            $table->index(['status', 'next_attempt_at']);
            $table->unique(['security_event_id', 'channel', 'recipient'], 'security_delivery_unique');
        });
    }
    public function down(): void
    {
        Schema::dropIfExists('security_event_deliveries'); Schema::dropIfExists('security_events');
    }
};
