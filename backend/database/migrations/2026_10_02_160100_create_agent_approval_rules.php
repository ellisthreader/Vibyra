<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Roadmap Part 16: standing approval rules. A rule is a pre-approval, never a bypass: the action still carries its exact
 * fingerprint, and the tool, connection and scope are re-checked when it is used. `approved_by`/`rule_id` on the action say
 * who approved it so the receipt can read "allowed by rule <id>". One master switch per account.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('agent_approval_rules', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('agent_id');
            $t->string('tool', 80);
            $t->uuid('connection_id');
            $t->string('scope', 200)->default('');
            $t->string('effect', 8);
            $t->timestamp('expires_at');
            $t->timestamp('revoked_at')->nullable();
            $t->timestamp('last_used_at')->nullable();
            $t->unsignedInteger('use_count')->default(0);
            $t->timestamps();
            $t->index(['user_id', 'agent_id', 'revoked_at']);
            $t->index(['agent_id', 'tool', 'connection_id']);
        });
        Schema::create('agent_rule_settings', function (Blueprint $t) {
            $t->foreignId('user_id')->primary()->constrained()->cascadeOnDelete();
            $t->boolean('paused')->default(false);
            $t->timestamps();
        });
        Schema::table('agent_tool_actions', function (Blueprint $t) {
            $t->string('approved_by', 8)->nullable();
            $t->uuid('rule_id')->nullable();
            if (!Schema::hasColumn('agent_tool_actions', 'secret_kinds')) $t->text('secret_kinds')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('agent_tool_actions', function (Blueprint $t) {
            $t->dropColumn(['approved_by', 'rule_id']);
            if (!\Illuminate\Support\Facades\DB::table('migrations')->where('migration', '2026_10_08_200000_add_secret_kinds_to_agent_tool_actions')->exists())
                $t->dropColumn('secret_kinds');
        });
        Schema::dropIfExists('agent_rule_settings');
        Schema::dropIfExists('agent_approval_rules');
    }
};
