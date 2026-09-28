<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chat_learning_memories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('project_key', 64)->nullable()->index();
            $table->string('project_name')->nullable();
            $table->string('mode', 16)->index();
            $table->string('model_key', 80)->nullable();
            $table->string('skill_id', 80)->nullable();
            $table->unsignedTinyInteger('score')->default(1);
            $table->text('prompt');
            $table->text('response_summary');
            $table->json('tags')->nullable();
            $table->string('reference', 120)->nullable()->index();
            $table->timestamps();

            $table->index(['user_id', 'project_key', 'mode', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chat_learning_memories');
    }
};
