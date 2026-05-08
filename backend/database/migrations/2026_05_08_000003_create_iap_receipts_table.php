<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('iap_receipts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('platform', 16); // 'apple' | 'google'
            $table->string('product_id', 96);
            $table->string('transaction_id', 128);
            $table->string('original_transaction_id', 128)->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->json('payload')->nullable();
            $table->timestamps();

            $table->unique(['platform', 'transaction_id']);
            $table->index(['user_id', 'product_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('iap_receipts');
    }
};
