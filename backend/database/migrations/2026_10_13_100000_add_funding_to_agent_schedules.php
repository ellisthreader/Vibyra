<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * A routine can be paid in Vibyra tokens: its due occurrence then starts an ordinary Vibes turn in the
 * teammate's conversation (the same quote, wallet, spend-cap and model-routing path as a typed message)
 * instead of waiting for a Mac. `account` stays the default, so every existing routine is unchanged.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agent_schedules', function (Blueprint $t): void {
            $t->string('funding', 10)->default('account');
        });
        Schema::table('agent_schedule_occurrences', function (Blueprint $t): void {
            $t->uuid('turn_id')->nullable()->index();
        });
    }

    public function down(): void
    {
        Schema::table('agent_schedule_occurrences', function (Blueprint $t): void {
            $t->dropColumn('turn_id');
        });
        Schema::table('agent_schedules', function (Blueprint $t): void {
            $t->dropColumn('funding');
        });
    }
};
