<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Bytes each account moved through the relay, per calendar month (UTC), as the relay reports them.
 * Contents are never seen or stored: only counts. See App\Services\Remote\RemoteDataAllowance.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('remote_data_usage', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->char('period', 7);
            $table->unsignedBigInteger('bytes')->default(0);
            $table->timestamps();
            $table->unique(['user_id', 'period']);
            $table->index(['period', 'bytes']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('remote_data_usage');
    }
};
