<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cloud sync v2 (docs/cloud-sync-v2-plan.md): what each Mac says it is doing (paused, the upload in flight with its bytes,
 * per-project errors) and the cloud computer's own health (its key published, its last failure), so the server can tell
 * the phone one true status per project instead of every client guessing.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('cloud_sync_macs', function (Blueprint $t) {
            $t->text('status')->nullable();
            $t->timestamp('reported_at')->nullable();
        });
        Schema::table('cloud_sync_vm_keys', function (Blueprint $t) {
            $t->boolean('key_ok')->nullable();
            $t->text('last_error')->nullable();
            $t->timestamp('last_error_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('cloud_sync_macs', fn (Blueprint $t) => $t->dropColumn(['status', 'reported_at']));
        Schema::table('cloud_sync_vm_keys', fn (Blueprint $t) => $t->dropColumn(['key_ok', 'last_error', 'last_error_at']));
    }
};
