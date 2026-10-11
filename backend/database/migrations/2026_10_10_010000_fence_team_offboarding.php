<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organization_removed_members', function (Blueprint $t) {
            $t->uuid('organization_id');
            $t->foreign('organization_id')->references('id')->on('organizations')->cascadeOnDelete();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->timestamp('removed_at');
            $t->primary(['organization_id', 'user_id']);
        });
    }

    public function down(): void { Schema::dropIfExists('organization_removed_members'); }
};
