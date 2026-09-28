<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $addIp = ! Schema::hasColumn('vibyra_sessions', 'ip_address');
        $addUserAgent = ! Schema::hasColumn('vibyra_sessions', 'user_agent');
        if (! $addIp && ! $addUserAgent) {
            return;
        }

        Schema::table('vibyra_sessions', function (Blueprint $table) {
            if (! Schema::hasColumn('vibyra_sessions', 'ip_address')) {
                $table->string('ip_address', 45)->nullable()->after('device_name');
            }
            if (! Schema::hasColumn('vibyra_sessions', 'user_agent')) {
                $table->text('user_agent')->nullable()->after('ip_address');
            }
        });
    }

    public function down(): void
    {
        $columns = array_values(array_filter(
            ['ip_address', 'user_agent'],
            fn (string $column) => Schema::hasColumn('vibyra_sessions', $column)
        ));
        if ($columns === []) {
            return;
        }
        Schema::table('vibyra_sessions', function (Blueprint $table) {
            $table->dropColumn(array_values(array_filter(
                ['ip_address', 'user_agent'],
                fn (string $column) => Schema::hasColumn('vibyra_sessions', $column)
            )));
        });
    }
};
