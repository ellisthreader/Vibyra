<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('vibes_chats', function (Blueprint $table) {
            $table->string('terminal_model', 200)->nullable();
            $table->string('terminal_model_name', 200)->nullable();
            $table->boolean('terminal_tools')->default(false);
            $table->unsignedBigInteger('terminal_budget_micro')->nullable();
            $table->timestamp('terminal_closed_at')->nullable();
        });
    }
    public function down(): void
    {
        Schema::table('vibes_chats', fn (Blueprint $table) => $table->dropColumn([
            'terminal_model', 'terminal_model_name', 'terminal_tools', 'terminal_budget_micro', 'terminal_closed_at',
        ]));
    }
};
