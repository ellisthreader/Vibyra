<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('user_level_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('action', 64);
            $table->string('context_hash', 64);
            $table->unsignedSmallInteger('xp_delta')->default(0);
            $table->unsignedSmallInteger('level_before')->default(1);
            $table->unsignedSmallInteger('level_after')->default(1);
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'action', 'context_hash']);
            $table->index(['user_id', 'created_at']);
            $table->index(['user_id', 'action']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_level_events');
    }
};
