<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('agent_cloud_file_scopes', function (Blueprint $t) {
            $t->string('id', 64)->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('agent_id');
            $t->uuid('workspace_id');
            $t->string('account_scope', 64);
            $t->unsignedInteger('file_count')->default(0);
            $t->unsignedInteger('stored_bytes')->default(0);
            $t->foreign('agent_id')->references('id')->on('agent_teammates')->cascadeOnDelete();
            $t->foreign('workspace_id')->references('id')->on('cloud_workspaces')->cascadeOnDelete();
        });
        Schema::create('agent_cloud_files', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->string('scope_id', 64);
            $t->string('path', 180);
            $t->unsignedInteger('revision');
            $t->timestamps();
            $t->unique(['scope_id', 'path']);
            $t->foreign('scope_id')->references('id')->on('agent_cloud_file_scopes')->cascadeOnDelete();
        });
        Schema::create('agent_cloud_file_versions', function (Blueprint $t) {
            $t->id();
            $t->uuid('file_id');
            $t->uuid('run_id');
            $t->unsignedInteger('revision');
            $t->unsignedInteger('bytes');
            $t->string('sha256', 64);
            $t->text('content');
            $t->timestamp('created_at');
            $t->unique(['file_id', 'revision']);
            $t->foreign('file_id')->references('id')->on('agent_cloud_files')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('agent_cloud_file_versions');
        Schema::dropIfExists('agent_cloud_files');
        Schema::dropIfExists('agent_cloud_file_scopes');
    }
};
