<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('membership_ends_at')->nullable()->after('plan_renews_at');
            $table->boolean('membership_cancel_at_period_end')->default(false)->after('membership_ends_at');
            $table->index(['membership_cancel_at_period_end', 'membership_ends_at'], 'users_membership_end_index');
        });

        DB::table('users')
            ->where('plan', '!=', 'free')
            ->orderBy('id')
            ->each(function ($user) {
                $refreshAt = $user->plan_renews_at
                    ? Carbon::parse($user->plan_renews_at)
                    : Carbon::now()->addMonth();
                $endsAt = $user->plan_billing_cycle === 'annual'
                    ? $refreshAt->copy()->addMonthsNoOverflow(11)
                    : $refreshAt;
                DB::table('users')->where('id', $user->id)->update([
                    'membership_ends_at' => $endsAt,
                ]);
            });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex('users_membership_end_index');
            $table->dropColumn(['membership_ends_at', 'membership_cancel_at_period_end']);
        });
    }
};
