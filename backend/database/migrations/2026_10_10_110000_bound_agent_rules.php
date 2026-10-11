<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agent_approval_rules', function (Blueprint $t) {
            $t->unsignedInteger('revision')->default(1);
            $t->unsignedInteger('max_uses')->default(20);
            // Legacy rows remain inert until explicitly reviewed with a current account and grant.
            $t->unsignedInteger('connection_generation')->nullable();
            $t->uuid('grant_id')->nullable();
            $t->unsignedInteger('grant_revision')->nullable();
            $t->string('schema_revision', 40)->nullable();
        });
        Schema::table('agent_tool_actions', fn (Blueprint $t) => $t->unsignedInteger('rule_revision')->nullable());
    }

    public function down(): void
    {
        Schema::table('agent_tool_actions', fn (Blueprint $t) => $t->dropColumn('rule_revision'));
        Schema::table('agent_approval_rules', fn (Blueprint $t) => $t->dropColumn([
            'revision', 'max_uses', 'connection_generation', 'grant_id', 'grant_revision', 'schema_revision',
        ]));
    }
};
