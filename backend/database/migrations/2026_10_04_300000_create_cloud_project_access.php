<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{DB, Schema};

/**
 * What Vibyra Cloud may use (docs/cloud-access-contract.md): one decision per Mac project (keyed like the sync engine,
 * projectKey = first 32 hex of sha256("vibyra-project:" + id)) and the account's Codex login carry-over policy.
 * Nothing syncs until a project is allowed; projects that already synced code keep working (grandfathered, source 'mac').
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('cloud_project_access', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->char('project_key', 32);
            $t->string('name', 120);
            $t->boolean('allowed')->default(false);
            $t->string('source', 10);
            $t->timestamps();
            $t->unique(['user_id', 'project_key']);
        });
        Schema::create('cloud_access_settings', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $t->string('codex_carry_over', 16)->default('allowed');
            $t->timestamps();
        });
        DB::table('cloud_sync_projects')->whereNull('removed_at')->where('up_seq', '>', 0)->orderBy('id')
            ->chunkById(500, function ($rows) {
                DB::table('cloud_project_access')->insertOrIgnore($rows->map(fn ($p) => ['user_id' => $p->user_id, 'project_key' => $p->project_key,
                    'name' => $p->name, 'allowed' => true, 'source' => 'mac', 'created_at' => now(), 'updated_at' => now()])->all());
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('cloud_access_settings');
        Schema::dropIfExists('cloud_project_access');
    }
};
