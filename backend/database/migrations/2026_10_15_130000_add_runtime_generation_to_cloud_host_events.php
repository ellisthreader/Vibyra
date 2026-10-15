<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Existing activity rows have no trustworthy boot identity. Keep them as history, never as live delivery authority. */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('cloud_host_events', fn (Blueprint $t) => $t->unsignedInteger('runtime_generation')->nullable());
    }

    public function down(): void
    {
        Schema::table('cloud_host_events', fn (Blueprint $t) => $t->dropColumn('runtime_generation'));
    }
};
