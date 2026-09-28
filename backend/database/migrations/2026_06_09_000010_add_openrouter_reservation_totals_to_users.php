<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->integer('credits_balance')->default(50)->change();
        });
        if (! Schema::hasColumn('users', 'openrouter_reserved_micro_usd')) {
            Schema::table('users', function (Blueprint $table) {
                $table->unsignedBigInteger('openrouter_reserved_micro_usd')->default(0);
            });
        }
        if (! Schema::hasColumn('users', 'openrouter_spent_micro_usd')) {
            Schema::table('users', function (Blueprint $table) {
                $table->unsignedBigInteger('openrouter_spent_micro_usd')->default(0);
            });
        }
        if (! Schema::hasColumn('users', 'openrouter_spend_period')) {
            Schema::table('users', function (Blueprint $table) {
                $table->string('openrouter_spend_period', 7)->nullable();
            });
        }

        Schema::table('credit_ledger', function (Blueprint $table) {
            $table->integer('credits_balance_after')->change();
        });
    }

    public function down(): void
    {
        Schema::table('credit_ledger', function (Blueprint $table) {
            $table->unsignedInteger('credits_balance_after')->change();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->unsignedInteger('credits_balance')->default(50)->change();
            $table->dropColumn([
                'openrouter_reserved_micro_usd',
                'openrouter_spent_micro_usd',
                'openrouter_spend_period',
            ]);
        });
    }
};
