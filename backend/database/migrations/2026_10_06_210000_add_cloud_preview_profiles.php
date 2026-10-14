<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('cloud_workspaces', function (Blueprint $t) {
            $t->boolean('compute_trial')->default(false);
            $t->string('compute_profile', 20)->nullable();
            $t->uuid('accepted_compute_quote')->nullable();
            $t->unsignedBigInteger('compute_budget_start')->default(0);
            $t->timestamp('preview_active_until')->nullable();
        });
        Schema::table('cloud_reservations', function (Blueprint $t) {
            $t->string('compute_profile', 20)->nullable(); $t->boolean('preview_trial')->default(false);
        });
        Schema::create('cloud_compute_quotes', function (Blueprint $t) {
            $t->uuid('id')->primary(); $t->uuid('workspace_id')->index();
            $t->unsignedBigInteger('user_id')->index(); $t->unsignedBigInteger('session_id');
            $t->string('device_id', 128); $t->text('payload');
            $t->timestamp('expires_at'); $t->uuid('request_id')->nullable();
            $t->timestamp('accepted_at')->nullable(); $t->timestamps();
            $t->unique(['user_id', 'request_id']);
        });
        Schema::create('cloud_preview_viewers', function (Blueprint $t) {
            $t->uuid('workspace_id'); $t->unsignedBigInteger('generation'); $t->unsignedBigInteger('app_session_id');
            $t->timestamp('active_until'); $t->primary(['workspace_id','app_session_id']);
        });
        Schema::create('cloud_egress_days', function (Blueprint $t) {
            $t->unsignedBigInteger('user_id'); $t->date('day'); $t->unsignedBigInteger('bytes'); $t->unsignedBigInteger('held')->default(0); $t->primary(['user_id','day']);
        });
        Schema::create('cloud_egress_counters', function (Blueprint $t) {
            $t->string('id', 80)->primary(); $t->uuid('workspace_id'); $t->unsignedBigInteger('generation');
            $t->unsignedBigInteger('bytes'); $t->unsignedBigInteger('authorized_bytes')->default(0); $t->date('day'); $t->timestamp('updated_at');
        });
        Schema::create('cloud_provider_exposures', function (Blueprint $t) {
            $t->string('idempotency_key')->primary(); $t->uuid('workspace_id')->index();
            $t->unsignedBigInteger('generation'); $t->boolean('trial')->default(false);
            $t->string('kind', 40); $t->unsignedBigInteger('micro_usd'); $t->timestamps();
        });
        Schema::create('cloud_preview_trials', function (Blueprint $t) {
            $t->unsignedBigInteger('user_id')->primary();
            $t->string('state', 20); $t->unsignedInteger('used_seconds')->default(0);
            $t->timestamp('confirmed_at')->nullable(); $t->timestamps();
        });
    }
    public function down(): void
    {
        Schema::table('cloud_reservations', fn (Blueprint $t) => $t->dropColumn(['compute_profile', 'preview_trial']));
        Schema::dropIfExists('cloud_preview_viewers');
        Schema::dropIfExists('cloud_egress_counters'); Schema::dropIfExists('cloud_egress_days');
        Schema::dropIfExists('cloud_provider_exposures');
        Schema::dropIfExists('cloud_preview_trials'); Schema::dropIfExists('cloud_compute_quotes');
        Schema::table('cloud_workspaces', fn (Blueprint $t) => $t->dropColumn([
            'compute_trial', 'compute_profile', 'accepted_compute_quote', 'compute_budget_start', 'preview_active_until',
        ]));
    }
};
