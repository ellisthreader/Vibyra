<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('model_catalog_state', function (Blueprint $table) {
            $table->unsignedInteger('id')->primary();
            $table->unsignedBigInteger('revision')->nullable();
            $table->timestamp('last_discovery_at')->nullable();
            $table->timestamp('last_run_at')->nullable();
        });
        Schema::create('model_catalog_models', function (Blueprint $table) {
            $table->string('id', 160)->primary();
            $table->char('fingerprint', 64);
            $table->text('metadata');
            $table->string('status', 24)->default('discovered');
            $table->string('reason', 120)->nullable();
            $table->unsignedInteger('misses')->default(0);
            $table->timestamp('seen_at');
            $table->timestamp('verified_at')->nullable();
            $table->text('proof')->nullable();
            $table->text('artwork')->nullable();
        });
        Schema::create('model_catalog_revisions', function (Blueprint $table) {
            $table->id();
            $table->char('content_hash', 64);
            $table->text('payload');
            $table->string('key_id', 80);
            $table->char('signature', 128);
            $table->timestamp('created_at');
        });
        Schema::create('model_catalog_budgets', function (Blueprint $table) {
            $table->string('id', 40)->primary();
            $table->unsignedBigInteger('reserved_micro')->default(0);
        });
        Schema::create('model_catalog_artwork', function (Blueprint $table) {
            $table->char('sha256', 64)->primary();
            $table->text('png_base64');
            $table->timestamp('created_at');
        });
        Schema::create('model_catalog_attempts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('model_id', 160)->index();
            $table->char('fingerprint', 64);
            $table->string('kind', 20);
            $table->string('state', 20)->default('dispatching');
            $table->unsignedBigInteger('reserved_micro');
            $table->timestamp('created_at');
            $table->timestamp('finished_at')->nullable();
            $table->unique(['model_id', 'fingerprint', 'kind']);
        });
    }

    public function down(): void
    {
        foreach (['attempts', 'artwork', 'budgets', 'revisions', 'models', 'state'] as $name) {
            Schema::dropIfExists('model_catalog_'.$name);
        }
    }
};
