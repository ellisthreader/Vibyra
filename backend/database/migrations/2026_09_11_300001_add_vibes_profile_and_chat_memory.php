<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Settings > Memory as the phone chat's memory: what the person writes about
 * themselves, each part with its own switch, and the memories a chat saved.
 *
 * The switches default on, so a part the person fills in is used without a second
 * step; an empty part is never sent whatever its switch says. `vibes_memories`
 * learns where each memory came from and, for a chat's, which turn saved it; the
 * turn keeps what it changed so the transcript can say so.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vibes_preferences', function (Blueprint $t) {
            $t->string('name', 60)->nullable();
            $t->boolean('name_enabled')->default(true);
            $t->string('occupation', 120)->nullable();
            $t->boolean('occupation_enabled')->default(true);
            $t->text('about')->nullable();
            $t->boolean('about_enabled')->default(true);
            $t->text('summary')->nullable();
            $t->boolean('summary_enabled')->default(true);
        });
        Schema::table('vibes_memories', function (Blueprint $t) {
            $t->string('source', 8)->default('user');
            $t->uuid('turn_id')->nullable();
        });
        Schema::table('vibes_turns', function (Blueprint $t) {
            $t->json('memory')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('vibes_turns', fn (Blueprint $t) => $t->dropColumn('memory'));
        Schema::table('vibes_memories', fn (Blueprint $t) => $t->dropColumn(['source', 'turn_id']));
        Schema::table('vibes_preferences', fn (Blueprint $t) => $t->dropColumn([
            'name', 'name_enabled', 'occupation', 'occupation_enabled', 'about', 'about_enabled', 'summary', 'summary_enabled',
        ]));
    }
};
