<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('published_project_deployments', function (Blueprint $table): void {
            $table->string('artifact_disk')->nullable();
            $table->string('artifact_path')->nullable();
            $table->char('artifact_sha256', 64)->nullable();
            $table->unsignedBigInteger('artifact_bytes')->nullable();
            $table->timestamp('artifact_stored_at')->nullable();
            $table->index('artifact_path');
        });
    }

    public function down(): void
    {
        Schema::table('published_project_deployments', function (Blueprint $table): void {
            $table->dropIndex(['artifact_path']);
            $table->dropColumn([
                'artifact_disk',
                'artifact_path',
                'artifact_sha256',
                'artifact_bytes',
                'artifact_stored_at',
            ]);
        });
    }
};
