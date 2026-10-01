<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Included cloud-computer seconds. Signed rows: consume is positive, release (refund) negative,
 * overrun is seconds run past an exhausted, blocked allowance (not counted as used).
 * The unique idempotency key makes every metering window and refund apply once.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('cloud_allowance_usage', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('user_id');
            $t->uuid('workspace_id');
            $t->unsignedInteger('generation')->default(0);
            $t->timestamp('period_start');
            $t->string('kind', 12);
            $t->integer('seconds');
            $t->string('idempotency_key', 190)->unique();
            $t->timestamp('created_at')->useCurrent();
            $t->index(['user_id', 'period_start']);
            $t->index(['workspace_id', 'generation']);
        });
        Schema::table('cloud_reservations', function (Blueprint $t) {
            $t->unsignedInteger('allowance_seconds')->default(0);
            $t->unsignedInteger('token_seconds')->default(0);
            // Provider-cost hold the spend ceilings count; the token hold shrinks when allowance covers the runway.
            $t->unsignedBigInteger('spend_held')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('cloud_reservations', fn (Blueprint $t) => $t->dropColumn(['allowance_seconds', 'token_seconds', 'spend_held']));
        Schema::dropIfExists('cloud_allowance_usage');
    }
};
