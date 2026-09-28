<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('analytics_daily_rollups', function (Blueprint $table): void {
            $table->id();
            $table->date('day');
            $table->string('surface', 16);
            $table->string('event', 48);
            $table->unsignedInteger('events_count');
            $table->unsignedInteger('engaged_seconds')->default(0);
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['day', 'surface', 'event']);
            $table->index('day');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('analytics_daily_rollups');
    }
};
