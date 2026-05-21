<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('vibyra_sessions', 'device_identifier')) {
            return;
        }

        Schema::table('vibyra_sessions', function (Blueprint $table) {
            $table->string('device_identifier', 128)->nullable()->after('device_name');
            $table->index(['user_id', 'device_identifier']);
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('vibyra_sessions', 'device_identifier')) {
            return;
        }

        Schema::table('vibyra_sessions', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'device_identifier']);
            $table->dropColumn('device_identifier');
        });
    }
};
