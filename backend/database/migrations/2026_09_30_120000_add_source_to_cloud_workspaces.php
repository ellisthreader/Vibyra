<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('cloud_workspaces', function (Blueprint $t) {
            $t->string('source', 16)->default('upload');
            $t->string('repo', 200)->nullable();
            $t->string('ref', 200)->nullable();
            $t->string('base_commit', 64)->nullable();
        });
    }
    public function down(): void
    {
        Schema::table('cloud_workspaces', fn (Blueprint $t) => $t->dropColumn(['source', 'repo', 'ref', 'base_commit']));
    }
};
