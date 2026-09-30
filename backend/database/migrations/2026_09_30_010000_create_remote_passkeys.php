<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('passkey_credentials', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('credential_hash', 64)->unique();
            $table->text('credential_id');
            $table->text('public_key');
            $table->unsignedBigInteger('counter')->default(0);
            $table->json('transports')->nullable();
            $table->string('device_name', 80);
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
        });
        Schema::create('remote_passkey_ceremonies', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('app_session_id')->constrained('vibyra_sessions')->cascadeOnDelete();
            $table->unsignedBigInteger('trusted_device_id')->index();
            $table->string('purpose', 20);
            $table->string('secret_hash', 64);
            $table->text('challenge');
            $table->json('options');
            $table->timestamp('expires_at')->index();
            $table->timestamp('consumed_at')->nullable();
            $table->timestamp('invalidated_at')->nullable();
            $table->timestamp('verified_at')->nullable();
            $table->timestamp('created_at');
        });
        Schema::create('remote_strong_auth', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('app_session_id')->constrained('vibyra_sessions')->cascadeOnDelete();
            $table->unsignedBigInteger('trusted_device_id');
            $table->foreignId('passkey_credential_id')->constrained()->cascadeOnDelete();
            $table->timestamp('verified_at');
            $table->timestamp('expires_at');
            $table->unique(['app_session_id', 'trusted_device_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('remote_strong_auth');
        Schema::dropIfExists('remote_passkey_ceremonies');
        Schema::dropIfExists('passkey_credentials');
    }
};
