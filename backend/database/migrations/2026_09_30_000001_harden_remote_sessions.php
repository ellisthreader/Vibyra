<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{DB, Schema};

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('remote_sessions', function (Blueprint $table) {
            $table->unsignedBigInteger('app_session_id')->nullable()->index();
            $table->string('status', 24)->default('EXPIRED')->index();
            $table->timestamp('admitted_at')->nullable();
            $table->timestamp('expires_at')->nullable()->index();
            $table->timestamp('revoked_at')->nullable();
        });
        // Old grants lack a durable app-session binding and cannot safely be
        // grandfathered into one-use authorization. Clients fetch a new grant.
        DB::table('remote_sessions')->whereNotNull('ended_at')->update(['status' => 'ENDED']);
        DB::table('remote_sessions')->whereNull('ended_at')->update(['ended_at' => now()]);
        Schema::create('remote_session_revocations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('remote_session_id')->unique()->constrained('remote_sessions')->cascadeOnDelete();
            $table->unsignedInteger('attempts')->default(0);
            $table->timestamp('next_attempt_at')->nullable()->index();
            $table->timestamp('acknowledged_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('remote_session_revocations');
        Schema::table('remote_sessions', fn (Blueprint $table) => $table->dropColumn([
            'app_session_id', 'status', 'admitted_at', 'expires_at', 'revoked_at',
        ]));
    }
};
