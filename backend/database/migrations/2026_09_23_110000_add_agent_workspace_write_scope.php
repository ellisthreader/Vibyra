<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('agent_workspaces', fn (Blueprint $table) =>
            $table->boolean('can_write')->default(false));
    }

    public function down(): void
    {
        Schema::table('agent_workspaces', fn (Blueprint $table) => $table->dropColumn('can_write'));
    }
};
