<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void {
        Schema::create('host_notification_credentials', function(Blueprint $t) {
            $t->id(); $t->foreignId('user_id')->constrained()->cascadeOnDelete(); $t->unsignedBigInteger('session_id');
            $t->string('host_id',64); $t->string('token_hash',64)->unique(); $t->timestamp('expires_at');
        });
        Schema::create('host_notification_cursors', function(Blueprint $t) {
            $t->id(); $t->foreignId('user_id')->constrained()->cascadeOnDelete(); $t->string('host_id',64);
            $t->string('session',100); $t->string('generation',100); $t->unsignedBigInteger('sequence');
            $t->timestamp('observed_at'); $t->unique(['user_id','host_id','session','generation'],'host_notification_cursor');
        });
    }
    public function down(): void { Schema::dropIfExists('host_notification_cursors'); Schema::dropIfExists('host_notification_credentials'); }
};
