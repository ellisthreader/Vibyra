<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('chat_cost_reservations')
            || ! Schema::hasColumn('chat_cost_reservations', 'status')) {
            return;
        }

        Schema::table('chat_cost_reservations', function (Blueprint $table) {
            $table->string('status', 20)->default('pending')->change();
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('chat_cost_reservations')
            || ! Schema::hasColumn('chat_cost_reservations', 'status')) {
            return;
        }

        Schema::table('chat_cost_reservations', function (Blueprint $table) {
            $table->enum('status', ['pending', 'settled', 'released', 'expired'])
                ->default('pending')
                ->change();
        });
    }
};
