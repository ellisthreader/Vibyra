<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('public_requests', function (Blueprint $table): void {
            $table->timestamp('owner_notified_at')->nullable();
            $table->timestamp('owner_notification_attempted_at')->nullable();
            $table->string('owner_notification_id')->nullable();
            $table->index(['owner_notified_at', 'owner_notification_attempted_at'], 'public_requests_notification_pending');
        });
    }

    public function down(): void
    {
        Schema::table('public_requests', function (Blueprint $table): void {
            $table->dropIndex('public_requests_notification_pending');
            $table->dropColumn(['owner_notified_at', 'owner_notification_attempted_at', 'owner_notification_id']);
        });
    }
};
