<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How the phone chat speaks to one person, and what it remembers about them.
 *
 * Both are keyed on `users.id` like everything else in Vibes, so a guest's
 * choices survive sign-up for the same reason its balance does: sign-up converts
 * the row rather than moving anything across. Neither is a legacy chat table;
 * the Vibes economy stays apart from `/api/chat` and its learning memory.
 *
 * A missing preferences row means the defaults, so nothing has to be written for
 * an account that never opens Settings > Personality.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vibes_preferences', function (Blueprint $t) {
            $t->foreignId('user_id')->primary()->constrained()->cascadeOnDelete();
            $t->string('style', 16)->default('balanced');
            $t->text('instructions')->nullable();
            $t->boolean('memory_enabled')->default(true);
            $t->timestamps();
        });
        Schema::create('vibes_memories', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('text', 200);
            $t->timestamps();
            $t->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vibes_memories');
        Schema::dropIfExists('vibes_preferences');
    }
};
