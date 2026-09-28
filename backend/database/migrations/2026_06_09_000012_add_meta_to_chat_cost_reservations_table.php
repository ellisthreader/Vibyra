<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('chat_cost_reservations')
            || Schema::hasColumn('chat_cost_reservations', 'meta')) {
            return;
        }

        Schema::table('chat_cost_reservations', function (Blueprint $table) {
            $table->json('meta')->nullable()->after('attempts');
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('chat_cost_reservations')
            || ! Schema::hasColumn('chat_cost_reservations', 'meta')) {
            return;
        }

        Schema::table('chat_cost_reservations', function (Blueprint $table) {
            $table->dropColumn('meta');
        });
    }
};
