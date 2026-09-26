<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void { Schema::table('agent_teammates', fn (Blueprint $t) => $t->string('model', 160)->default('auto')); }
    public function down(): void { Schema::table('agent_teammates', fn (Blueprint $t) => $t->dropColumn('model')); }
};
