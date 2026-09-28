<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Room to renew a provider token that expires. Figma's access tokens last 90
 * days and its token endpoint hands back a refresh token to trade for the next
 * one; that refresh token used to be read off the response and dropped, so a
 * Figma connection died three months after it was made and the catalogue went
 * on reporting it as connected. Both columns are nullable: a provider whose
 * token does not expire, which is GitHub and Stripe today, stores neither and
 * takes no new code path.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vibes_integration_installs', function (Blueprint $table) {
            // Encrypted like `credential`, and never returned to a client either.
            $table->text('refresh_token')->nullable()->after('credential');
            $table->timestamp('expires_at')->nullable()->after('refresh_token');
        });
    }

    public function down(): void
    {
        Schema::table('vibes_integration_installs', function (Blueprint $table) {
            $table->dropColumn(['refresh_token', 'expires_at']);
        });
    }
};
