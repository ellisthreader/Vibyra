<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Remote access through Vibyra Cloud. `remote_hosts` is the account's computer
 * registry: one row per Vibyra Desktop identity (its Noise public key), with the
 * relay presence the relay reports. `remote_sessions` is one row per connection
 * grant a phone was given, opened and closed by relay events. `remote_audit_events`
 * records when a computer came online or a phone connected — never what was
 * typed or shown, which never reaches this server in the first place.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('remote_hosts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('host_id', 64)->unique();
            $table->string('name', 80);
            $table->string('platform', 32)->nullable();
            $table->string('app_version', 40)->nullable();
            $table->timestamp('registered_at');
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamp('online_until')->nullable();
            $table->string('relay_id', 80)->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'revoked_at']);
        });
        Schema::create('remote_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('remote_host_id')->constrained('remote_hosts')->cascadeOnDelete();
            $table->string('grant_id', 40)->unique();
            $table->string('client_name', 80)->nullable();
            $table->string('relay_client_id', 40)->nullable();
            $table->timestamp('issued_at');
            $table->timestamp('started_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();
            $table->index(['remote_host_id', 'started_at']);
        });
        Schema::create('remote_audit_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('remote_host_id')->nullable()->constrained('remote_hosts')->nullOnDelete();
            $table->string('event', 40);
            $table->json('detail')->nullable();
            $table->timestamp('created_at');
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('remote_audit_events');
        Schema::dropIfExists('remote_sessions');
        Schema::dropIfExists('remote_hosts');
    }
};
