<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('published_project_deployments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('published_project_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('provider')->default('static')->index();
            $table->string('provider_project_id')->nullable();
            $table->string('provider_service_id')->nullable();
            $table->string('provider_deployment_id')->nullable();
            $table->string('status')->default('queued')->index();
            $table->string('provider_status')->nullable();
            $table->string('hosting_mode')->default('static')->index();
            $table->boolean('demo_mode_enabled')->default(true);
            $table->json('disabled_features')->nullable();
            $table->string('stack')->nullable();
            $table->string('build_command')->nullable();
            $table->string('start_command')->nullable();
            $table->string('public_url')->nullable();
            $table->string('entry_path')->nullable();
            $table->longText('demo_html')->nullable();
            $table->json('demo_files')->nullable();
            $table->json('metadata')->nullable();
            $table->text('last_error')->nullable();
            $table->text('latest_logs_summary')->nullable();
            $table->timestamp('hosted_at')->nullable()->index();
            $table->timestamps();

            $table->index(['published_project_id', 'status', 'hosted_at'], 'project_deployment_success_idx');
            $table->index(['published_project_id', 'created_at'], 'project_deployment_latest_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('published_project_deployments');
    }
};
