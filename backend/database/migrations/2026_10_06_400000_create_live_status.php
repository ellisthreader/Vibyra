<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Mac status Live Activity: one row per iPhone (its start and card tokens) and the Mac's latest snapshot. Additive only. */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('live_status_phones', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            // The app's own install id; one row per iPhone per account.
            $t->string('install_id', 64);
            // Encrypted at rest; the hash finds a token without decrypting.
            $t->text('start_token')->nullable();
            $t->string('start_hash', 64)->nullable()->unique();
            $t->text('card_token')->nullable();
            $t->string('card_hash', 64)->nullable()->unique();
            // Development-signed builds get sandbox tokens; remembered after the first answer.
            $t->string('apns_host', 12)->nullable();
            $t->string('last_state', 64)->nullable();
            $t->string('last_alert', 160)->nullable();
            $t->timestamp('last_sent_at')->nullable();
            $t->timestamp('last_start_at')->nullable();
            $t->timestamps();
            $t->unique(['user_id', 'install_id']);
        });
        Schema::create('live_status_snapshots', function (Blueprint $t) {
            $t->foreignId('user_id')->primary()->constrained()->cascadeOnDelete();
            $t->string('mac_name', 64);
            $t->json('snapshot');
            $t->timestamp('busy_at')->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('live_status_snapshots');
        Schema::dropIfExists('live_status_phones');
    }
};
