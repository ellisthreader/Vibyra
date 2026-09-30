<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void {
        Schema::create('agent_read_markers', function (Blueprint $table): void {
            $table->foreignId('user_id')->constrained()->cascadeOnDelete(); $table->uuid('agent_id');
            $table->foreign('agent_id')->references('id')->on('agent_teammates')->cascadeOnDelete();
            $table->string('cursor', 64); $table->timestamps();
            $table->primary(['user_id', 'agent_id']);
        });
    }
    public function down(): void { Schema::dropIfExists('agent_read_markers'); }
};
