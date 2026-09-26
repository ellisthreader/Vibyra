<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * One profile photo per account, held in the database rather than on disk:
 * Railway's filesystem is replaced on every deploy and the default disk is
 * `local`, so a file written there would be gone by the next release.
 *
 * The photo is always a 512x512 JPEG (40-80 KB), stored base64 in a long text
 * column. That is the one type that behaves the same on every driver: MySQL's
 * BLOB stops at 64 KB and PostgreSQL's bytea comes back from PDO as a stream
 * resource where SQLite returns a string. `sha256` is what versions the signed
 * URL, so a changed photo is a new URL and an old one can be cached forever.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_avatars', function (Blueprint $table) {
            $table->foreignId('user_id')->primary()->constrained()->cascadeOnDelete();
            $table->longText('data');
            $table->char('sha256', 64);
            $table->unsignedSmallInteger('width');
            $table->unsignedSmallInteger('height');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_avatars');
    }
};
