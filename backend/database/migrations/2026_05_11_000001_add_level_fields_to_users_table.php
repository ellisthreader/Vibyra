<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedInteger('level_xp_total')->default(0)->after('credits_used');
            $table->unsignedSmallInteger('level')->default(1)->after('level_xp_total');
            $table->unsignedSmallInteger('level_rewarded_level')->default(1)->after('level');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'level_xp_total',
                'level',
                'level_rewarded_level',
            ]);
        });
    }
};
