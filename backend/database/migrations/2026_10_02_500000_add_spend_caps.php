<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Spend caps are additive and inert until SPEND_CAPS_ENABLED. Caps are stored in canonical
 * units (10,000 per Vibyra token) on the wallet row that every spender already locks, so a
 * cap check shares that transaction and adds no lock. `wallet_spend_periods` holds the
 * O(1) counters: one row per account, period kind and period start.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vibes_wallets', function (Blueprint $t) {
            $t->unsignedBigInteger('cap_day_units')->nullable();
            $t->unsignedBigInteger('cap_month_units')->nullable();
            $t->unsignedBigInteger('cap_run_units')->nullable();
            $t->string('cap_timezone', 64)->nullable();
            // null = the operator default; 'tokens' keeps running on tokens, 'stop' halts when included hours run out.
            $t->string('cloud_hours_overage', 10)->nullable();
        });
        Schema::create('wallet_spend_periods', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('kind', 8);
            $t->timestamp('starts_at');
            $t->timestamp('ends_at');
            $t->unsignedBigInteger('held')->default(0);
            $t->unsignedBigInteger('spent')->default(0);
            $t->boolean('alerted_warn')->default(false);
            $t->boolean('alerted_full')->default(false);
            // "Raise for today": extra headroom recorded on this one period, gone when it rolls.
            $t->unsignedBigInteger('raised_units')->default(0);
            $t->timestamp('raised_at')->nullable();
            $t->unique(['user_id', 'kind', 'starts_at']);
            $t->index(['user_id', 'kind', 'ends_at']);
        });
        Schema::table('notification_preferences', fn (Blueprint $t) => $t->boolean('spend')->default(true));
    }

    public function down(): void
    {
        Schema::table('notification_preferences', fn (Blueprint $t) => $t->dropColumn('spend'));
        Schema::dropIfExists('wallet_spend_periods');
        Schema::table('vibes_wallets', fn (Blueprint $t) => $t->dropColumn(['cap_day_units', 'cap_month_units', 'cap_run_units',
            'cap_timezone', 'cloud_hours_overage']));
    }
};
