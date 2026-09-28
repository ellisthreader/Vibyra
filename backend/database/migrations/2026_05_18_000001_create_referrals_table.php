<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('referral_code', 16)->nullable()->after('billing_provider');
            $table->unique('referral_code');
        });

        Schema::create('referrals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('referrer_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('referred_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('code', 16);
            $table->timestamp('signup_reward_granted_at')->nullable();
            $table->timestamp('paid_reward_granted_at')->nullable();
            $table->string('paid_plan', 24)->nullable();
            $table->string('paid_provider', 24)->nullable();
            $table->timestamps();

            $table->unique('referred_user_id');
            $table->unique(['referrer_user_id', 'referred_user_id']);
            $table->index(['referrer_user_id', 'created_at']);
            $table->index('paid_reward_granted_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('referrals');

        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['referral_code']);
            $table->dropColumn('referral_code');
        });
    }
};
