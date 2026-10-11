<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        Schema::create('agent_browser_access_versions', function (Blueprint $t) {
            $t->foreignId('user_id')->constrained()->cascadeOnDelete(); $t->uuid('agent_id');
            $t->unsignedInteger('revision')->default(0); $t->string('request_hash', 64)->nullable();
            $t->primary(['user_id', 'agent_id']);
        });
    }
    public function down(): void { Schema::dropIfExists('agent_browser_access_versions'); }
};
