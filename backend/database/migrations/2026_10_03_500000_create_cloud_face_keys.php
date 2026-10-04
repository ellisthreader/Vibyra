<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The phone's Face ID key for Vibyra Cloud: an X25519 public key whose private half sits in the iPhone Keychain behind
 * Face ID. Registered only right after a sign-in (so a stolen session token cannot add one) and bound to that session;
 * "Connect to cloud" must answer a challenge sealed to it, which unlocks only with the person's face.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('cloud_face_keys', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->index()->constrained()->cascadeOnDelete();
            $t->foreignId('session_id')->unique()->constrained('vibyra_sessions')->cascadeOnDelete();
            $t->char('public_key', 64);
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cloud_face_keys');
    }
};
