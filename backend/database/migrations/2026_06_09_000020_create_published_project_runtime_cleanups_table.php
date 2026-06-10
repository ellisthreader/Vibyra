<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('published_project_runtime_cleanups', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('provider');
            $table->string('provider_project_id');
            $table->string('provider_service_id')->nullable();
            $table->string('status')->default('pending')->index();
            $table->string('reason')->nullable();
            $table->unsignedInteger('attempts')->default(0);
            $table->text('last_error')->nullable();
            $table->timestamp('next_attempt_at')->nullable()->index();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->unique(['provider', 'provider_project_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('published_project_runtime_cleanups');
    }
};
