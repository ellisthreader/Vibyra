<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which AI accounts and integrations Vibyra Cloud may use (docs/cloud-access-contract.md, "Accounts"). Everything is on
 * until the person unticks it on the Connect page or in Cloud settings; an account with no settings row is all on.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('cloud_access_settings', function (Blueprint $t) {
            $t->boolean('claude_enabled')->default(true);
            $t->boolean('codex_enabled')->default(true);
            $t->boolean('github_enabled')->default(true);
        });
    }

    public function down(): void
    {
        Schema::table('cloud_access_settings', function (Blueprint $t) {
            $t->dropColumn(['claude_enabled', 'codex_enabled', 'github_enabled']);
        });
    }
};
