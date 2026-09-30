<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** F-05: how many times a run was re-claimed after its runner's lease lapsed (a crash or sleep loop), capped by `agents_v2.max_claims`. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agent_runs', function (Blueprint $t) {
            $t->unsignedSmallInteger('lapsed_claims')->default(0);
        });
    }

    public function down(): void
    {
        Schema::table('agent_runs', function (Blueprint $t) {
            $t->dropColumn('lapsed_claims');
        });
    }
};
