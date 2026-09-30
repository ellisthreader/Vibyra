<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Agent V2 Stage 2: typed receipts. `outcome` is the typed result (confirmed,
 * refused, retryable, rate_limited, reconnect_required, outcome_unknown),
 * `provider_url` the resource link, `idempotency_key` the provider-side key or
 * reconciliation handle (Calendar event id, Gmail Message-ID) when one exists.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agent_receipts', function (Blueprint $t) {
            $t->string('outcome', 24)->nullable();
            $t->string('provider_url', 500)->nullable();
            $t->string('idempotency_key', 120)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('agent_receipts', function (Blueprint $t) {
            $t->dropColumn(['outcome', 'provider_url', 'idempotency_key']);
        });
    }
};
