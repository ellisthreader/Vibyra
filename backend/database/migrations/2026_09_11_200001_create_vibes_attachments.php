<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Photos and files sent with a phone chat message. They are uploaded before the
 * message is priced, so the quote can carry a reference instead of the bytes: the
 * quote travels to the phone and back, and a photo inside it would triple its size.
 * `tokens` is the input bound the attachment adds to a turn, fixed at upload so the
 * quote and the queued job price it identically. `turn_id` is set when the message
 * is sent, which is what shows the attachment in that turn's transcript.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vibes_attachments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->uuid('turn_id')->nullable()->index();
            // image, pdf or text: how the attachment is sent to the model.
            $table->string('kind', 10);
            $table->string('mime', 100);
            $table->string('name', 200);
            $table->unsignedInteger('bytes');
            $table->unsignedInteger('tokens');
            $table->string('path', 300);
            $table->timestamps();
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vibes_attachments');
    }
};
