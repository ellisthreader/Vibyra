<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('analytics_ingest_counts', function (Blueprint $table): void {
            $table->date('day');
            $table->string('surface', 16);
            $table->string('status', 16);
            $table->unsignedInteger('count')->default(0);
            $table->primary(['day', 'surface', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('analytics_ingest_counts');
    }
};
