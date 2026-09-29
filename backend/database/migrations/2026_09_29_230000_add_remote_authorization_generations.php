<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void {
        Schema::table('remote_hosts', fn (Blueprint $table) => $table->unsignedBigInteger('authorization_generation')->default(1));
        Schema::table('remote_sessions', fn (Blueprint $table) => $table->unsignedBigInteger('authorization_generation')->default(1));
        Schema::create('remote_identity_challenges', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('app_session_id')->index();
            $table->string('host_id', 64);
            $table->string('action', 16);
            $table->unsignedBigInteger('generation');
            $table->string('proof_hash', 64);
            $table->timestamp('expires_at')->index();
            $table->timestamp('consumed_at')->nullable();
        });
        Schema::create('remote_revocations', function (Blueprint $table) {
            $table->id();
            $table->string('host_id', 64);
            $table->unsignedBigInteger('generation');
            $table->unsignedInteger('attempts')->default(0);
            $table->timestamp('next_attempt_at')->nullable()->index();
            $table->timestamp('acknowledged_at')->nullable();
            $table->timestamps();
            $table->unique(['host_id', 'generation']);
        });
    }
    public function down(): void {
        Schema::dropIfExists('remote_identity_challenges');
        Schema::dropIfExists('remote_revocations');
        Schema::table('remote_sessions', fn (Blueprint $table) => $table->dropColumn('authorization_generation'));
        Schema::table('remote_hosts', fn (Blueprint $table) => $table->dropColumn('authorization_generation'));
    }
};
