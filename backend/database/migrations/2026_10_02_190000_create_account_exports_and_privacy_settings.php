<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Roadmap Part 19, additive and inert until ACCOUNT_EXPORT_ENABLED / ACCOUNT_RETENTION_ENABLED.
 * `account_exports` is one row per "Download my data" request: the archive's path and expiry live here, never a link.
 * `account_privacy_settings` holds the person's own choices (journal retention, in days, within the server's maximum).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('account_exports', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('status', 12); // queued | building | ready | failed | expired
            $t->string('path', 255)->nullable();
            $t->unsignedBigInteger('bytes')->nullable();
            $t->string('error', 60)->nullable();
            $t->timestamp('requested_at');
            $t->timestamp('ready_at')->nullable();
            $t->timestamp('expires_at')->nullable();
            $t->timestamps();
            $t->index(['user_id', 'requested_at']);
            $t->index(['status', 'expires_at']);
        });
        Schema::create('account_privacy_settings', function (Blueprint $t) {
            $t->foreignId('user_id')->primary()->constrained()->cascadeOnDelete();
            $t->unsignedSmallInteger('journal_retention_days')->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('account_privacy_settings');
        Schema::dropIfExists('account_exports');
    }
};
