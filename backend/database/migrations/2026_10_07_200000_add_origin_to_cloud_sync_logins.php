<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Where a carried login came from (docs/cloud-sync-contract.md, "Logins", 2026-10-07): `cloud` = a fresh login the Mac
 * created only for Vibyra Cloud (the person clicked Allow), null = a copy of the Mac's own login (dropped by the VM).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('cloud_sync_logins', function (Blueprint $t) {
            $t->string('origin', 12)->nullable()->after('provider');
        });
    }

    public function down(): void
    {
        Schema::table('cloud_sync_logins', function (Blueprint $t) {
            $t->dropColumn('origin');
        });
    }
};
