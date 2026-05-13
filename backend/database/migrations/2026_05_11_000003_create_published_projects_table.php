<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('published_projects', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('source_project_id')->nullable()->index();
            $table->string('slug')->unique();
            $table->string('title');
            $table->text('description');
            $table->string('stack')->nullable();
            $table->json('tags')->nullable();
            $table->longText('preview_html')->nullable();
            $table->string('visibility')->default('public')->index();
            $table->unsignedInteger('likes_count')->default(0);
            $table->unsignedInteger('comments_count')->default(0);
            $table->timestamp('published_at')->nullable()->index();
            $table->timestamps();
        });

        Schema::create('published_project_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('published_project_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->text('body');
            $table->timestamps();
        });

        Schema::create('published_project_reactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('published_project_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('type')->default('like');
            $table->timestamps();
            $table->unique(['published_project_id', 'user_id', 'type'], 'published_project_reaction_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('published_project_reactions');
        Schema::dropIfExists('published_project_comments');
        Schema::dropIfExists('published_projects');
    }
};
