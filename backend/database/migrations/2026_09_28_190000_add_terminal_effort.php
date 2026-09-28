<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void { Schema::table('vibes_chats', fn (Blueprint $table) => $table->string('terminal_effort', 16)->nullable()); }
    public function down(): void { Schema::table('vibes_chats', fn (Blueprint $table) => $table->dropColumn('terminal_effort')); }
};
