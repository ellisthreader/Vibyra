<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * One row per account per connected integration. The credential is encrypted with the
 * application key and is never read back out to the client: the install page
 * shows what the account is, never what was pasted to reach it.
 *
 * `vibes_tools` gains two nullable columns rather than a second table, because an
 * integration call is the same thing a project tool call is - one tool request inside
 * one turn - and the batch logic that waits for every call to be answered has to
 * see both kinds or a mixed reply would deadlock.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vibes_integration_installs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('integration');
            $table->text('credential');
            // What the person sees on the install page to know which account this is.
            $table->string('account_label')->nullable();
            $table->timestamp('connected_at')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'integration']);
        });

        Schema::table('vibes_tools', function (Blueprint $table) {
            // Null means the phone answers this call against the connected computer.
            $table->string('integration')->nullable()->after('operation');
            // One line for the transcript. The full result stays server-side.
            $table->string('summary')->nullable()->after('result');
        });
    }

    public function down(): void
    {
        Schema::table('vibes_tools', function (Blueprint $table) {
            $table->dropColumn(['integration', 'summary']);
        });
        Schema::dropIfExists('vibes_integration_installs');
    }
};
