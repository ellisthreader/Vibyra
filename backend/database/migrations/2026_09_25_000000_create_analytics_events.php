<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('analytics_events', function (Blueprint $table): void {
            $table->id();
            $table->uuid('event_id')->unique();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('surface', 16);
            $table->string('event', 48);
            $table->string('dimension', 100)->nullable();
            $table->string('platform', 16)->nullable();
            $table->string('provider', 40)->nullable();
            $table->string('model', 80)->nullable();
            $table->string('effort', 16)->nullable();
            $table->string('screen', 40)->nullable();
            $table->string('project_kind', 40)->nullable();
            $table->string('visitor_hash', 64)->nullable();
            $table->json('properties')->nullable();
            $table->timestamp('occurred_at');
            $table->timestamp('created_at')->useCurrent();
            $table->index(['surface', 'event', 'occurred_at']);
            $table->index(['occurred_at', 'user_id']);
            $table->index(['visitor_hash', 'occurred_at']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('analytics_events');
    }
};
