<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{DB, Schema};

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('remote_sessions', fn (Blueprint $table) => $table->timestamp('last_activity_at')->nullable());
        DB::table('remote_sessions')->whereNotNull('admitted_at')->update(['last_activity_at' => DB::raw('admitted_at')]);
    }

    public function down(): void
    {
        Schema::table('remote_sessions', fn (Blueprint $table) => $table->dropColumn('last_activity_at'));
    }
};
