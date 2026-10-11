<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What a reply read and wrote, summed over every step of its turn, so Usage history can say
 * "1,240 in · 320 out" beside the model it ran on. Null until OpenRouter reports usage.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vibes_turns', function (Blueprint $t) {
            $t->unsignedBigInteger('input_tokens')->nullable();
            $t->unsignedBigInteger('output_tokens')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('vibes_turns', fn (Blueprint $t) => $t->dropColumn(['input_tokens', 'output_tokens']));
    }
};
