<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{DB, Schema};

return new class extends Migration {
    public function up(): void
    {
        Schema::create('assistant_controls', function (Blueprint $table) {
            $table->unsignedInteger('id')->primary();
            $table->boolean('tripped')->default(false);
        });
        DB::table('assistant_controls')->insert(['id' => 1]);
        Schema::create('assistant_buckets', function (Blueprint $table) {
            $table->string('id', 120)->primary();
            $table->unsignedBigInteger('micro_usd')->default(0);
            $table->unsignedBigInteger('calls')->default(0);
        });
        Schema::create('assistant_requests', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->uuid('request_id');
            $table->string('kind', 20);
            $table->string('state', 20)->default('reserved');
            $table->unsignedBigInteger('reserved_micro_usd');
            $table->unsignedBigInteger('charged_micro_usd')->nullable();
            $table->unsignedBigInteger('reserved_units');
            $table->unsignedBigInteger('charged_units')->nullable();
            $table->unsignedInteger('unit_scale');
            $table->unsignedBigInteger('free_micro_usd')->default(0);
            $table->json('allocations');
            $table->json('buckets');
            $table->timestamp('created_at');
            $table->timestamp('finished_at')->nullable();
            $table->unique(['user_id', 'request_id']);
            $table->index(['state', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('assistant_requests');
        Schema::dropIfExists('assistant_buckets');
        Schema::dropIfExists('assistant_controls');
    }
};
