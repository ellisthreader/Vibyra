<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('phone_waitlist_signups', function (Blueprint $table): void {
            $table->id();
            $table->string('email')->unique();
            $table->string('source', 32)->default('marketing-home');
            $table->timestamp('notified_at')->nullable();
            $table->timestamps();
            $table->index(['notified_at', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('phone_waitlist_signups');
    }
};
