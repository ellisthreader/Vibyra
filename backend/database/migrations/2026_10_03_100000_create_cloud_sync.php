<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cloud sync (docs/cloud-sync-contract.md): the Mac keeps projects ready on the account's cloud computer.
 * Everything is user-scoped and goes when the account does. Blob rows only point at sealed files on the sync disk.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('cloud_sync_macs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->char('device_id', 36);
            $t->string('name', 120);
            $t->char('public_key', 64);
            $t->timestamp('last_seen_at')->nullable();
            $t->timestamps();
            $t->unique(['user_id', 'device_id']);
        });
        // The cloud computer's public key (null until its first boot posts one) and the "Updating files..." flag.
        Schema::create('cloud_sync_vm_keys', function (Blueprint $t) {
            $t->foreignId('user_id')->primary()->constrained()->cascadeOnDelete();
            $t->char('public_key', 64)->nullable();
            $t->boolean('applying')->default(false);
            $t->timestamp('applying_at')->nullable();
            $t->timestamps();
        });
        Schema::create('cloud_sync_projects', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->char('project_key', 32);
            $t->string('name', 64);
            $t->unsignedBigInteger('up_seq')->default(0);
            $t->char('up_head', 40)->nullable();
            $t->timestamp('up_synced_at')->nullable();
            $t->unsignedBigInteger('up_applied_seq')->default(0);
            $t->char('up_applied_head', 40)->nullable();
            $t->timestamp('applied_at')->nullable();
            $t->unsignedBigInteger('transcripts_seq')->default(0);
            $t->unsignedBigInteger('transcripts_applied_seq')->default(0);
            $t->unsignedBigInteger('down_seq')->default(0);
            $t->char('down_head', 40)->nullable();
            $t->timestamp('down_at')->nullable();
            $t->unsignedBigInteger('transcripts_down_seq')->default(0);
            $t->string('state', 12)->default('pending');
            $t->string('reason', 200)->nullable();
            $t->boolean('resync')->default(false);
            $t->timestamp('removed_at')->nullable();
            $t->timestamp('removed_seen_at')->nullable();
            $t->timestamps();
            $t->unique(['user_id', 'project_key']);
            $t->unique(['user_id', 'name']);
        });
        Schema::create('cloud_sync_blobs', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->foreignId('project_id')->constrained('cloud_sync_projects')->cascadeOnDelete();
            $t->string('path', 200);
            $t->string('direction', 4);
            $t->string('kind', 12);
            $t->unsignedBigInteger('seq');
            $t->unsignedBigInteger('base_seq')->default(0);
            $t->char('head', 40)->nullable();
            $t->char('sha256', 64);
            $t->unsignedBigInteger('bytes');
            $t->unsignedBigInteger('recipient_mac_id')->nullable();
            $t->timestamp('fetched_at')->nullable();
            $t->timestamp('applied_at')->nullable();
            $t->timestamp('failed_at')->nullable();
            $t->string('error', 300)->nullable();
            $t->timestamps();
            $t->index(['user_id', 'direction', 'applied_at', 'failed_at']);
            $t->index(['project_id', 'direction', 'kind', 'seq']);
            $t->index('recipient_mac_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cloud_sync_blobs');
        Schema::dropIfExists('cloud_sync_projects');
        Schema::dropIfExists('cloud_sync_vm_keys');
        Schema::dropIfExists('cloud_sync_macs');
    }
};
