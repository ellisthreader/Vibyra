<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Opt-in carry-over of an agent login to the cloud computer (docs/cloud-sync-contract.md, "Logins").
 * One row per (account, provider). Only seq/applied metadata is permanent; the sealed blob (blob_id/path) lives
 * until the cloud computer acks it, a newer upload replaces it, or 24 hours pass. The backend never decrypts it.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('cloud_sync_logins', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('provider', 12);
            $t->unsignedBigInteger('seq')->default(0);
            $t->unsignedBigInteger('applied_seq')->default(0);
            $t->timestamp('applied_at')->nullable();
            $t->timestamp('failed_at')->nullable();
            $t->string('error', 200)->nullable();
            $t->uuid('blob_id')->nullable()->unique();
            $t->string('path', 200)->nullable();
            $t->unsignedInteger('bytes')->default(0);
            $t->char('sha256', 64)->nullable();
            $t->timestamp('uploaded_at')->nullable();
            $t->timestamp('fetched_at')->nullable();
            $t->timestamps();
            $t->unique(['user_id', 'provider']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cloud_sync_logins');
    }
};
