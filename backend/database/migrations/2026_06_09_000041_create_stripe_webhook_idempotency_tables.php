<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stripe_webhook_events', function (Blueprint $table): void {
            $table->id();
            $table->string('event_id', 96)->unique();
            $table->string('type', 96);
            $table->string('object_type', 48);
            $table->string('object_id', 128);
            $table->timestamp('event_created_at');
            $table->string('status', 16)->default('pending');
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->timestamp('processed_at')->nullable();
            $table->string('last_error', 1000)->nullable();
            $table->timestamps();

            $table->index(['object_type', 'object_id', 'event_created_at'], 'stripe_event_object_order');
        });

        Schema::create('stripe_webhook_object_states', function (Blueprint $table): void {
            $table->id();
            $table->string('object_type', 48);
            $table->string('object_id', 128);
            $table->string('last_event_id', 96)->nullable();
            $table->timestamp('last_event_created_at')->nullable();
            $table->timestamps();

            $table->unique(['object_type', 'object_id'], 'stripe_object_state_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stripe_webhook_object_states');
        Schema::dropIfExists('stripe_webhook_events');
    }
};
