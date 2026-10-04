<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One Face ID per remote visit. A confirmation is either a passkey (the browser ceremony) or the phone's Face ID key
 * (`cloud_face_keys`, no web page), and `visit_until` lets dropped connections of the same visit reconnect without a
 * new one: see App\Services\Remote\RemoteVisit.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('remote_strong_auth', function (Blueprint $table): void {
            $table->string('method', 16)->default('passkey');
            $table->unsignedBigInteger('passkey_credential_id')->nullable()->change();
            $table->timestamp('visit_until')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('remote_strong_auth', function (Blueprint $table): void {
            $table->dropColumn(['method', 'visit_until']);
        });
    }
};
