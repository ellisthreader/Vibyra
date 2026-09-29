<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('remote_hosts', function (Blueprint $table) {
            $table->unsignedBigInteger('security_revision')->default(0);
            $table->unsignedBigInteger('disable_revision')->default(0);
            $table->unsignedBigInteger('reset_revision')->default(0);
        });
        Schema::table('trusted_devices', function (Blueprint $table) {
            $table->unsignedBigInteger('approved_revision')->default(0);
            $table->unsignedBigInteger('revocation_revision')->default(0);
            $table->index(['remote_host_id', 'revocation_revision']);
        });
    }

    public function down(): void
    {
        Schema::table('trusted_devices', function (Blueprint $table) {
            $table->dropIndex(['remote_host_id', 'revocation_revision']);
            $table->dropColumn(['approved_revision', 'revocation_revision']);
        });
        Schema::table('remote_hosts', fn (Blueprint $table) => $table->dropColumn(['security_revision', 'disable_revision', 'reset_revision']));
    }
};
