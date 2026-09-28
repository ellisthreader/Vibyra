<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (! Schema::hasColumn('users', 'burst_credits_used')) {
            Schema::table('users', function (Blueprint $table) {
                $table->unsignedInteger('burst_credits_used')->default(0)->after('daily_credits_reset_at');
            });
        }
        if (! Schema::hasColumn('users', 'burst_credits_reset_at')) {
            Schema::table('users', function (Blueprint $table) {
                $table->timestamp('burst_credits_reset_at')->nullable()->after('burst_credits_used');
            });
        }
        if (! Schema::hasColumn('users', 'weekly_credits_used')) {
            Schema::table('users', function (Blueprint $table) {
                $table->unsignedInteger('weekly_credits_used')->default(0)->after('burst_credits_reset_at');
            });
        }
        if (! Schema::hasColumn('users', 'weekly_credits_reset_at')) {
            Schema::table('users', function (Blueprint $table) {
                $table->timestamp('weekly_credits_reset_at')->nullable()->after('weekly_credits_used');
            });
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'burst_credits_used',
                'burst_credits_reset_at',
                'weekly_credits_used',
                'weekly_credits_reset_at',
            ]);
        });
    }
};
