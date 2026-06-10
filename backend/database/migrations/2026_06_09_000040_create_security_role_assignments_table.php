<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('security_role_assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('role', 40);
            $table->string('grant_source', 40)->default('manual');
            $table->string('bootstrap_key', 64)->nullable()->unique();
            $table->foreignId('granted_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('granted_at');
            $table->foreignId('revoked_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('revoked_at')->nullable()->index();
            $table->string('revocation_reason', 160)->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'role']);
            $table->index(['role', 'revoked_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('security_role_assignments');
    }
};
