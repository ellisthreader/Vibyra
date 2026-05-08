<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('plan_billing_cycle', 16)->default('monthly')->after('plan');
            $table->timestamp('plan_renews_at')->nullable()->after('plan_billing_cycle');
            $table->unsignedInteger('daily_credits_used')->default(0)->after('credits_used');
            $table->timestamp('daily_credits_reset_at')->nullable()->after('daily_credits_used');
            $table->string('stripe_customer_id', 64)->nullable()->after('daily_credits_reset_at');
            $table->string('stripe_subscription_id', 64)->nullable()->after('stripe_customer_id');
            $table->string('billing_provider', 16)->nullable()->after('stripe_subscription_id');

            $table->index('stripe_customer_id');
            $table->index('stripe_subscription_id');
            $table->index('plan_renews_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['stripe_customer_id']);
            $table->dropIndex(['stripe_subscription_id']);
            $table->dropIndex(['plan_renews_at']);
            $table->dropColumn([
                'plan_billing_cycle',
                'plan_renews_at',
                'daily_credits_used',
                'daily_credits_reset_at',
                'stripe_customer_id',
                'stripe_subscription_id',
                'billing_provider',
            ]);
        });
    }
};
