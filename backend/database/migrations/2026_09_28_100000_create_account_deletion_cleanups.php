<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('account_deletion_cleanups', function (Blueprint $table): void {
            $table->id();
            // No foreign key: the record must survive deletion until storage is purged.
            $table->unsignedBigInteger('user_id')->unique();
            $table->string('disk');
            $table->string('attachment_directory');
            $table->json('stripe_subscription_ids')->nullable();
            $table->string('status', 16)->default('pending')->index();
            $table->unsignedInteger('attempts')->default(0);
            $table->string('last_error', 64)->nullable();
            $table->timestamp('next_attempt_at')->nullable()->index();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('account_deletion_cleanups');
    }
};
