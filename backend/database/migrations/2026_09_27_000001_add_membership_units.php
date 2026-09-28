<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('vibes_wallets', function (Blueprint $t) {
            $t->unsignedTinyInteger('billing_version')->default(1);
            $t->string('active_project_key', 400)->nullable();
            $t->timestamp('free_enrolled_at')->nullable();
            $t->timestamp('free_next_at')->nullable();
        });
        Schema::table('vibes_grants', function (Blueprint $t) {
            $t->bigInteger('amount')->change(); $t->bigInteger('remaining')->change();
            $t->timestamp('expires_at')->nullable()->index();
        });
        Schema::table('vibes_turns', function (Blueprint $t) {
            $t->unsignedInteger('unit_scale')->default(1); $t->bigInteger('free_reserved_micro')->default(0);
            $t->bigInteger('reserved')->change(); $t->bigInteger('charged')->default(0)->change();
        });
        Schema::table('vibes_ledger', function (Blueprint $t) {
            $t->unsignedInteger('unit_scale')->default(1); $t->bigInteger('delta')->change();
        });
        Schema::table('vibes_spend_days', function (Blueprint $t) {
            $t->bigInteger('free_spent')->default(0); $t->bigInteger('free_held')->default(0);
        });
        Schema::create('membership_events', function (Blueprint $t) {
            $t->string('id')->primary(); $t->string('status'); $t->string('type'); $t->text('payload');
            $t->string('error')->nullable(); $t->timestamps();
        });
        Schema::create('membership_capacity', function (Blueprint $t) {
            $t->string('key')->primary(); $t->unsignedInteger('enrolled')->default(0);
        });
        Schema::create('membership_orders', function (Blueprint $t) {
            $t->uuid('id')->primary(); $t->foreignId('user_id')->constrained();
            $t->string('offer_key'); $t->string('offer_version'); $t->string('price_id');
            $t->string('customer_id'); $t->string('session_id')->nullable()->unique();
            $t->boolean('refund_pending')->default(false); $t->timestamp('fulfilled_at')->nullable(); $t->text('checkout_url')->nullable(); $t->timestamp('expires_at')->nullable();
            $t->timestamps();
        });
        Schema::create('membership_owners', function (Blueprint $t) {
            $t->string('reference')->primary(); $t->foreignId('user_id')->constrained();
        });
        Schema::create('membership_periods', function (Blueprint $t) {
            $t->string('reference')->primary(); $t->uuid('order_id')->nullable()->index(); $t->boolean('disputed')->default(false); $t->foreignId('user_id')->constrained();
            $t->string('provider'); $t->string('environment'); $t->string('subscription_id')->nullable()->index();
            $t->string('payment_id')->nullable()->index(); $t->string('offer_key');
            $t->timestamp('starts_at'); $t->timestamp('ends_at')->nullable();
            $t->bigInteger('renewal_signed_at')->nullable(); $t->boolean('cancel_at_end')->default(false); $t->timestamp('revoked_at')->nullable();
            $t->bigInteger('units'); $t->unsignedInteger('money_scale')->default(100); $t->integer('paid_minor'); $t->integer('refunded_minor')->default(0); $t->integer('refund_requested')->default(0);
            $t->bigInteger('revoked_units')->default(0); $t->bigInteger('loss_units')->default(0);
            $t->string('currency', 3); $t->timestamps();
        });
    }
    public function down(): void
    {
        // Monetary migration is forward-only after any v2 wallet exists.
        if (\Illuminate\Support\Facades\DB::table('vibes_wallets')->where('billing_version', 2)->exists()) {
            throw new RuntimeException('Do not roll back a wallet that has used fractional tokens.');
        }
        Schema::dropIfExists('membership_owners'); Schema::dropIfExists('membership_periods'); Schema::dropIfExists('membership_orders');
        Schema::dropIfExists('membership_capacity'); Schema::dropIfExists('membership_events');
        Schema::table('vibes_wallets', fn (Blueprint $t) => $t->dropColumn(['billing_version', 'free_enrolled_at', 'free_next_at', 'active_project_key']));
        Schema::table('vibes_grants', fn (Blueprint $t) => $t->dropColumn('expires_at'));
        Schema::table('vibes_turns', fn (Blueprint $t) => $t->dropColumn(['unit_scale', 'free_reserved_micro']));
        Schema::table('vibes_spend_days', fn (Blueprint $t) => $t->dropColumn(['free_spent', 'free_held']));
        Schema::table('vibes_ledger', fn (Blueprint $t) => $t->dropColumn('unit_scale'));
    }
};
