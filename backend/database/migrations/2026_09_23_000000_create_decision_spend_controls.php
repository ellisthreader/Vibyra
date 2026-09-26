<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{DB, Schema};
return new class extends Migration {
    public function up(): void
    {
        Schema::create('decision_spend_controls', function (Blueprint $t) {
            $t->unsignedInteger('id')->primary(); $t->uuid('owner')->nullable();
            $t->timestamp('busy_until')->nullable(); $t->boolean('tripped')->default(false);
        });
        DB::table('decision_spend_controls')->insert(['id' => 1]);
        Schema::create('decision_spend_buckets', function (Blueprint $t) {
            $t->string('id', 100)->primary(); $t->unsignedBigInteger('calls')->default(0);
            $t->unsignedBigInteger('reserved_micro_usd')->default(0);
        });
    }
    public function down(): void
    {
        Schema::dropIfExists('decision_spend_buckets'); Schema::dropIfExists('decision_spend_controls');
    }
};
