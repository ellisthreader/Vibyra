<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        // No blanket hold reset: old financial events acquire provenance when replayed.
        Schema::table('membership_events', function (Blueprint $table) {
            $table->uuid('order_id')->nullable();
            $table->index(['order_id', 'status']);
        });
    }
    public function down(): void
    {
        Schema::table('membership_events', function (Blueprint $table) {
            $table->dropIndex(['order_id', 'status']); $table->dropColumn('order_id');
        });
    }
};
