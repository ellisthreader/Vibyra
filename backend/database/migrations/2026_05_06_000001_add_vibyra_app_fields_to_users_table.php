<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('provider')->nullable()->after('email');
            $table->string('provider_id')->nullable()->after('provider');
            $table->string('plan')->default('free')->after('password');
            $table->unsignedInteger('credits_balance')->default(50)->after('plan');
            $table->unsignedInteger('credits_used')->default(0)->after('credits_balance');
            $table->boolean('onboarding_complete')->default(false)->after('credits_used');
            $table->json('remembered_desktops')->nullable()->after('onboarding_complete');
            $table->json('app_state')->nullable()->after('remembered_desktops');
            $table->unique(['provider', 'provider_id']);
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['provider', 'provider_id']);
            $table->dropColumn([
                'provider',
                'provider_id',
                'plan',
                'credits_balance',
                'credits_used',
                'onboarding_complete',
                'remembered_desktops',
                'app_state',
            ]);
        });
    }
};
