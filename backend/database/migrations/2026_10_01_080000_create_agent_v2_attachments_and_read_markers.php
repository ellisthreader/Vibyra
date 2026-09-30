<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Agent V2 Phase 8. Attachments are uploaded before a run is admitted and named
 * by id in the admission; the bytes stay on the private disk and only the leased
 * runner of a run that names them can fetch them. Read markers are per device
 * (one per signed-in session or declared device id) so each Mac/iPhone keeps
 * its own unread dot.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('agent_v2_attachments', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            // image, pdf or text (same validation as phone chat attachments).
            $t->string('kind', 10);
            $t->string('mime', 100);
            $t->string('name', 200);
            $t->unsignedInteger('bytes');
            $t->string('sha256', 64);
            $t->string('path', 300);
            $t->timestamps();
            $t->index(['user_id', 'created_at']);
        });
        Schema::create('agent_v2_read_markers', function (Blueprint $t) {
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->uuid('agent_id');
            $t->string('device', 80);
            $t->string('cursor', 64);
            $t->timestamps();
            $t->primary(['user_id', 'agent_id', 'device']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('agent_v2_read_markers');
        Schema::dropIfExists('agent_v2_attachments');
    }
};
