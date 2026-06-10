<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vibyra_sessions', function (Blueprint $table) {
            $table->string('previous_token_hash', 64)->nullable()->index()->after('token_hash');
            $table->timestamp('previous_token_expires_at')->nullable()->after('previous_token_hash');
            $table->timestamp('idle_expires_at')->nullable()->index()->after('last_used_at');
            $table->timestamp('absolute_expires_at')->nullable()->index()->after('idle_expires_at');
            $table->timestamp('rotated_at')->nullable()->after('absolute_expires_at');
            $table->timestamp('revoked_at')->nullable()->index()->after('rotated_at');
            $table->string('revocation_reason', 80)->nullable()->after('revoked_at');
        });
    }

    public function down(): void
    {
        Schema::table('vibyra_sessions', function (Blueprint $table) {
            $table->dropColumn([
                'previous_token_hash',
                'previous_token_expires_at',
                'idle_expires_at',
                'absolute_expires_at',
                'rotated_at',
                'revoked_at',
                'revocation_reason',
            ]);
        });
    }
};
