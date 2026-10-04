<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The phone's "Connect to cloud" agreement (docs/cloud-sync-contract.md, "Connect"). One row per acceptance, kept as the
 * legal record: which consent text version, from where, and when. ip_hash is sha256(ip + app key), never the raw address.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('cloud_connect_consents', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->index()->constrained()->cascadeOnDelete();
            $t->unsignedInteger('version');
            $t->string('source', 20);
            $t->timestamp('accepted_at');
            $t->string('user_agent', 255)->nullable();
            $t->string('ip_hash', 64)->nullable();
            $t->timestamp('revoked_at')->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cloud_connect_consents');
    }
};
