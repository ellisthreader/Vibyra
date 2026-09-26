<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('openrouter_model_releases', function (Blueprint $table): void {
            $table->id();
            $table->string('model_id', 160)->unique();
            $table->string('name', 180);
            $table->timestamp('released_at')->nullable();
            $table->timestamp('discord_attempted_at')->nullable();
            $table->timestamp('discord_delivered_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('openrouter_model_releases');
    }
};
