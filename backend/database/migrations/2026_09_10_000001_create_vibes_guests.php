<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Guest accounts, so Vibes can be tried before there is anything to sign in to.
 *
 * A guest is a real `users` row with `guest_at` set, not a parallel kind of
 * identity. That is deliberate: every wallet, grant, ledger row, chat and turn is
 * keyed on `users.id`, so signing up *converts the same row* rather than moving a
 * balance between two of them. There is no transfer, so there is no window in
 * which a balance could be counted twice or lost, and "spend it all as a guest,
 * sign up, still have nothing" is true because the account never changed.
 *
 * `vibes_guest_installs` is the cheap half of the anti-farming control, keyed on
 * the app's install id. It cannot key on the device: a DeviceCheck token is
 * single-use, so it is a different string on every call, and Apple's bit0 — which
 * survives deleting the app — is the only durable per-device fact. This table
 * answers the obvious repeat without spending an Apple round trip, and leaves an
 * audit trail of how many guests one install asked for.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $t) {
            $t->timestamp('guest_at')->nullable()->index()->after('provider_id');
        });
        Schema::create('vibes_guest_installs', function (Blueprint $t) {
            // sha256 of the app's install id. Never the device token: that is
            // single-use, and storing one would identify hardware to no purpose.
            $t->string('hash', 64)->primary();
            $t->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $t->timestamp('granted_at');
            $t->timestamp('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vibes_guest_installs');
        Schema::table('users', fn (Blueprint $t) => $t->dropColumn('guest_at'));
    }
};
