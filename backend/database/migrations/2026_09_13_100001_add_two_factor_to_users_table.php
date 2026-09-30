<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Two-factor authentication on an account. The secret and the recovery codes are
 * encrypted with the application key rather than hashed, because the secret has to be
 * readable to check a code at all; the same key protects both, so hashing the codes
 * would guard nothing the secret does not already need. `confirmed_at` is what makes
 * it real: a secret with no confirmation is a setup somebody started and walked away
 * from, and it never gates a login.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->text('two_factor_secret')->nullable()->after('password');
            $table->text('two_factor_recovery_codes')->nullable()->after('two_factor_secret');
            $table->timestamp('two_factor_confirmed_at')->nullable()->after('two_factor_recovery_codes');
            // The last accepted time slot, so one code cannot be used twice inside its window.
            $table->unsignedBigInteger('two_factor_last_slot')->nullable()->after('two_factor_confirmed_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['two_factor_secret', 'two_factor_recovery_codes', 'two_factor_confirmed_at', 'two_factor_last_slot']);
        });
    }
};
