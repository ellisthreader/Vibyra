<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A run parked by `provider_signin` / `limits` is not re-offered to the same
 * binding revision until the account changes (re-registration bumps the
 * revision) or, for limits, `resume_after` passes.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agent_runs', function (Blueprint $t) {
            $t->unsignedInteger('wait_revision')->nullable();
            $t->timestamp('resume_after')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('agent_runs', function (Blueprint $t) {
            $t->dropColumn(['wait_revision', 'resume_after']);
        });
    }
};
