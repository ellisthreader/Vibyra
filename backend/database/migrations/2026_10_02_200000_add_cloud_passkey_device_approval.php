<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trusted_devices', function (Blueprint $table): void {
            $table->string('approved_via', 24)->nullable();
            $table->uuid('approved_assertion_id')->nullable()->unique();
        });
    }

    public function down(): void
    {
        Schema::table('trusted_devices', function (Blueprint $table): void {
            $table->dropUnique(['approved_assertion_id']);
            $table->dropColumn(['approved_via', 'approved_assertion_id']);
        });
    }
};
