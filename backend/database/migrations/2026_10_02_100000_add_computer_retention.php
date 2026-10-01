<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('cloud_workspaces', function (Blueprint $t) {
            $t->timestamp('retention_warned_at')->nullable();
            $t->timestamp('retention_deleted_at')->nullable();
        });
    }
    public function down(): void
    {
        Schema::table('cloud_workspaces', fn (Blueprint $t) => $t->dropColumn(['retention_warned_at', 'retention_deleted_at']));
    }
};
