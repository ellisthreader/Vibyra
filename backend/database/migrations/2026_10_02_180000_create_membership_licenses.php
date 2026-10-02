<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('membership_licenses', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->string('key_hash', 64)->unique();
            $t->string('key_suffix', 8);
            $t->uuid('request_id')->unique();
            $t->string('request_hash', 64);
            $t->foreignId('issued_by')->nullable()->constrained('users')->nullOnDelete();
            $t->string('label', 120);
            $t->unsignedInteger('tokens');
            $t->string('allowance', 16);
            $t->unsignedInteger('duration_months')->nullable();
            $t->timestamp('fixed_ends_at')->nullable();
            $t->timestamp('claim_by');
            $t->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $t->timestamp('redeemed_at')->nullable();
            $t->timestamp('ends_at')->nullable();
            $t->timestamp('revoked_at')->nullable();
            $t->timestamps();
            $t->index(['user_id', 'ends_at']);
        });
        Schema::create('membership_license_claims', function (Blueprint $t) {
            $t->foreignId('user_id')->primary()->constrained()->cascadeOnDelete();
            $t->string('key_hash', 64)->nullable();
            $t->string('status', 32);
            $t->timestamp('expires_at');
            $t->timestamps();
        });
        Schema::create('membership_license_audits', function (Blueprint $t) {
            $t->id();
            $t->uuid('license_id');
            $t->foreign('license_id')->references('id')->on('membership_licenses');
            $t->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('event', 32);
            $t->timestamp('created_at');
        });
    }

    public function down(): void
    {
        // Retain the grant provenance; rollback by disabling new issuance instead.
        throw new RuntimeException('License accounting migrations are forward-only.');
    }
};
