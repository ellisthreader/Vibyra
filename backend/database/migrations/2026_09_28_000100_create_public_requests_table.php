<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('public_requests', function (Blueprint $table): void {
            $table->id();
            $table->string('reference', 26)->unique();
            $table->string('email', 254);
            $table->string('topic', 32);
            $table->string('status', 16)->default('new');
            $table->string('details', 500)->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();
            $table->index(['created_at', 'id']);
            $table->index(['status', 'created_at']);
            $table->index(['status', 'closed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('public_requests');
    }
};
