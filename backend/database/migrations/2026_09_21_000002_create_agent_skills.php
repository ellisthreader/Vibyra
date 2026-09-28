<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void {
        Schema::create('agent_skills', function (Blueprint $t): void {
            $t->uuid('id')->primary(); $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('name', 80); $t->text('instructions'); $t->unsignedInteger('revision')->default(1); $t->timestamps();
        });
        Schema::create('agent_skill_assignments', function (Blueprint $t): void {
            $t->uuid('agent_id'); $t->uuid('skill_id'); $t->primary(['agent_id','skill_id']);
            $t->foreign('agent_id')->references('id')->on('agent_teammates')->cascadeOnDelete();
            $t->foreign('skill_id')->references('id')->on('agent_skills')->cascadeOnDelete();
        });
    }
    public function down(): void { Schema::dropIfExists('agent_skill_assignments'); Schema::dropIfExists('agent_skills'); }
};
