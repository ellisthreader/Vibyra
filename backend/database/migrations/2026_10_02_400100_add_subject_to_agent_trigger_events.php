<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Part 4 loop guard: the thing an event is about (a Linear issue, a Slack thread, a GitHub
 * issue), so a burst on one subject admits one run while an earlier run on it is live.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agent_trigger_events', function (Blueprint $t) {
            $t->string('subject', 191)->nullable();
            $t->index(['trigger_id', 'subject', 'created_at'], 'agent_trigger_events_subject_index');
        });
    }

    public function down(): void
    {
        Schema::table('agent_trigger_events', function (Blueprint $t) {
            $t->dropIndex('agent_trigger_events_subject_index');
            $t->dropColumn('subject');
        });
    }
};
