<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('published_project_reports', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('published_project_id')->constrained()->cascadeOnDelete();
            $table->foreignId('reporter_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('reason', 32);
            $table->text('details')->nullable();
            $table->longText('screenshot_data_url')->nullable();
            $table->string('status', 24)->default('pending');
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'created_at']);
            $table->index(['reporter_user_id', 'published_project_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('published_project_reports');
    }
};
