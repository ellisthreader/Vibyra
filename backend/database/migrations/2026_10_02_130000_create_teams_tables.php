<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Roadmap Part 13: organizations, members (one organization per account), invitations (only the SHA-256 of the link token is
 * stored), one OIDC configuration per organization (client secret encrypted) and the identities that sign-in has bound.
 * Money-like columns are canonical spend units (10,000 per token), the same unit as vibes_wallets.cap_month_units.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organizations', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->string('name', 80);
            $t->unsignedInteger('seats')->nullable();
            $t->string('stripe_subscription_id', 80)->nullable();
            $t->string('stripe_item_id', 80)->nullable();
            $t->unsignedBigInteger('member_month_cap_units')->nullable();
            $t->timestamps();
        });
        Schema::create('organization_members', function (Blueprint $t) {
            $t->id();
            $t->foreignUuid('organization_id')->constrained('organizations')->cascadeOnDelete();
            $t->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $t->string('role', 10);
            $t->unsignedBigInteger('month_cap_units')->nullable();
            $t->string('joined_via', 10)->default('invite');
            $t->timestamps();
            $t->index(['organization_id', 'role']);
        });
        Schema::create('organization_invitations', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignUuid('organization_id')->constrained('organizations')->cascadeOnDelete();
            $t->string('email', 254);
            $t->string('role', 10)->default('member');
            $t->char('token_hash', 64)->unique();
            $t->foreignId('invited_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('expires_at');
            $t->timestamp('accepted_at')->nullable();
            $t->foreignId('accepted_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('revoked_at')->nullable();
            $t->timestamps();
            $t->index(['organization_id', 'email']);
        });
        Schema::create('organization_sso', function (Blueprint $t) {
            $t->uuid('organization_id')->primary();
            $t->foreign('organization_id')->references('id')->on('organizations')->cascadeOnDelete();
            $t->string('issuer', 300);
            $t->string('client_id', 200);
            $t->text('client_secret');
            $t->string('domain', 253);
            $t->string('domain_token', 64);
            // Set only once the domain is proven; unique so no two organizations can hold the same domain.
            $t->string('verified_domain', 253)->nullable()->unique();
            $t->string('domain_method', 10)->nullable();
            $t->timestamp('domain_verified_at')->nullable();
            $t->boolean('enabled')->default(false);
            $t->boolean('require_sso')->default(false);
            $t->timestamps();
        });
        Schema::create('organization_sso_identities', function (Blueprint $t) {
            $t->id();
            $t->foreignUuid('organization_id')->constrained('organizations')->cascadeOnDelete();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('subject', 255);
            $t->timestamp('last_sign_in_at')->nullable();
            $t->timestamps();
            $t->unique(['organization_id', 'subject']);
            $t->unique(['organization_id', 'user_id']);
        });
    }

    public function down(): void
    {
        foreach (['organization_sso_identities', 'organization_sso', 'organization_invitations', 'organization_members', 'organizations'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
