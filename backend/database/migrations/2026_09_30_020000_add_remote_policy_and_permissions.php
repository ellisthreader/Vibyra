<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('remote_hosts', function (Blueprint $table) {
            $table->string('remote_access_mode', 16)->default('disabled');
            $table->timestamp('security_enabled_at')->nullable();
        });
        Schema::table('remote_sessions', function (Blueprint $table) {
            $table->json('permissions')->nullable();
            $table->timestamp('authorized_at')->nullable();
        });
        Schema::create('remote_host_security_challenges', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('remote_host_id')->constrained('remote_hosts')->cascadeOnDelete();
            $table->unsignedBigInteger('app_session_id');
            $table->unsignedBigInteger('authorization_generation');
            $table->string('purpose', 24);
            $table->string('resource', 64);
            $table->string('parameters_hash', 64);
            $table->string('proof_hash', 64);
            $table->timestamp('expires_at')->index();
            $table->timestamp('consumed_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('remote_host_security_challenges');
        Schema::table('remote_sessions', fn (Blueprint $table) => $table->dropColumn(['permissions', 'authorized_at']));
        Schema::table('remote_hosts', fn (Blueprint $table) => $table->dropColumn(['remote_access_mode', 'security_enabled_at']));
    }
};
