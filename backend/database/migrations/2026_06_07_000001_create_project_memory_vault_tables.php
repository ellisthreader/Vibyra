<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('project_memory_vaults', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('project_id', 190);
            $table->unsignedBigInteger('revision')->default(0);
            $table->timestamps();

            $table->unique(['user_id', 'project_id']);
        });

        Schema::create('project_memory_nodes', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignId('vault_id')->constrained('project_memory_vaults')->cascadeOnDelete();
            $table->foreignUlid('parent_id')->nullable()->constrained('project_memory_nodes')->cascadeOnDelete();
            $table->string('type', 16);
            $table->string('name', 255);
            $table->longText('markdown_content')->nullable();
            $table->string('source', 32)->default('native');
            $table->string('source_path', 1024)->nullable();
            $table->unsignedInteger('position')->default(0);
            $table->unsignedBigInteger('version')->default(1);
            $table->timestamps();

            $table->index(['vault_id', 'parent_id', 'position']);
            $table->unique(['vault_id', 'parent_id', 'name']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_memory_nodes');
        Schema::dropIfExists('project_memory_vaults');
    }
};
