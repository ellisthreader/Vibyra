<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** iPhone notifications over direct APNs: device provider/host, item text and grouping, a Failed category. Additive only. */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('notification_devices', function (Blueprint $t) {
            // `expo` (legacy Expo push token) or `apns` (raw APNs device token).
            $t->string('provider', 8)->default('expo');
            // Remembered after Apple's first answer: development builds hold sandbox tokens.
            $t->string('apns_host', 12)->nullable();
            // The same iPhone's Live Activity install id (live_status_phones.install_id).
            $t->string('live_install_id', 64)->nullable();
        });
        Schema::table('notification_items', function (Blueprint $t) {
            $t->string('body', 160)->nullable();
            $t->string('thread', 64)->nullable();
            $t->string('level', 16)->nullable();
        });
        Schema::table('notification_preferences', function (Blueprint $t) {
            $t->boolean('failures')->default(true);
        });
    }

    public function down(): void
    {
        Schema::table('notification_preferences', fn (Blueprint $t) => $t->dropColumn('failures'));
        Schema::table('notification_items', fn (Blueprint $t) => $t->dropColumn(['body', 'thread', 'level']));
        Schema::table('notification_devices', fn (Blueprint $t) => $t->dropColumn(['provider', 'apns_host', 'live_install_id']));
    }
};
