<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trusted_devices', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('remote_host_id')->constrained('remote_hosts')->cascadeOnDelete();
            $table->unsignedBigInteger('authorization_generation');
            $table->string('public_key', 64);
            $table->string('device_name', 80);
            $table->string('platform', 32)->nullable();
            $table->json('permissions');
            $table->string('last_ip', 45)->nullable();
            $table->string('pairing_code', 6);
            $table->timestamp('request_expires_at');
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('denied_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'remote_host_id', 'public_key']);
        });
        Schema::create('remote_device_challenges', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('trusted_device_id')->constrained('trusted_devices')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('app_session_id');
            $table->unsignedBigInteger('authorization_generation');
            $table->string('purpose', 32);
            $table->string('proof_hash', 64);
            $table->json('permissions');
            $table->timestamp('expires_at')->index();
            $table->timestamp('consumed_at')->nullable();
            $table->index(['app_session_id', 'expires_at']);
        });
        Schema::table('remote_sessions', fn (Blueprint $table) => $table->foreignId('trusted_device_id')->nullable()->constrained('trusted_devices')->nullOnDelete());
    }

    public function down(): void
    {
        Schema::table('remote_sessions', fn (Blueprint $table) => $table->dropConstrainedForeignId('trusted_device_id'));
        Schema::dropIfExists('remote_device_challenges');
        Schema::dropIfExists('trusted_devices');
    }
};
