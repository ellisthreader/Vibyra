<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The cloud computer is one cloud_workspaces row per account (kind = 'computer')
 * that runs the headless vibyra-host. computer_user_id is unique and only set on
 * computer rows, so an account can never own two (NULLs do not collide).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('cloud_workspaces', function (Blueprint $t) {
            $t->string('kind', 16)->default('project');
            $t->unsignedBigInteger('computer_user_id')->nullable()->unique();
            $t->unsignedBigInteger('remote_host_id')->nullable()->index();
            $t->timestamp('terms_accepted_at')->nullable();
            $t->unsignedInteger('host_running')->default(0);
            $t->unsignedInteger('host_waiting')->default(0);
            $t->timestamp('host_activity_at')->nullable();
            $t->boolean('login_claude')->nullable();
            $t->boolean('login_codex')->nullable();
            $t->text('host_projects')->nullable();
        });
        Schema::create('cloud_computer_projects', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('workspace_id');
            $t->string('name', 64);
            $t->string('repo', 200)->nullable();
            $t->string('branch', 200)->nullable();
            $t->string('state', 12)->default('pending');
            $t->string('error', 200)->nullable();
            $t->timestamp('done_at')->nullable();
            $t->timestamps();
            $t->unique(['workspace_id', 'name']);
            $t->index(['workspace_id', 'state']);
        });
        Schema::create('cloud_computer_wakes', function (Blueprint $t) {
            $t->id();
            $t->uuid('workspace_id');
            $t->unsignedBigInteger('user_id');
            $t->timestamp('created_at');
            $t->index(['user_id', 'created_at']);
            $t->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cloud_computer_wakes');
        Schema::dropIfExists('cloud_computer_projects');
        Schema::table('cloud_workspaces', function (Blueprint $t) {
            $t->dropUnique(['computer_user_id']);
            $t->dropIndex(['remote_host_id']);
            $t->dropColumn(['kind', 'computer_user_id', 'remote_host_id', 'terms_accepted_at',
                'host_running', 'host_waiting', 'host_activity_at', 'login_claude', 'login_codex', 'host_projects']);
        });
    }
};
