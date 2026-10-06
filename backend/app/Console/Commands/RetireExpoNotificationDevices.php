<?php
namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Before phone push is switched on: retire every legacy Expo-token device so nothing is sent to a
 * registration made by an older build. The app re-registers with an APNs token on its next launch
 * (the same installation row comes back to life). Idempotent; prints counts only.
 */
final class RetireExpoNotificationDevices extends Command
{
    protected $signature = 'vibyra:notifications-retire-expo {--dry-run : Count only}';
    protected $description = 'Revoke legacy Expo notification devices (counts only, idempotent)';

    public function handle(): int
    {
        $active = DB::table('notification_devices')->whereNull('revoked_at');
        $this->line('Active devices: '.(clone $active)->count().' (apns '.(clone $active)->where('provider', 'apns')->count()
            .', expo '.(clone $active)->where('provider', 'expo')->count().')');
        if ($this->option('dry-run')) return self::SUCCESS;
        $revoked = DB::table('notification_devices')->where('provider', 'expo')->whereNull('revoked_at')->update(['revoked_at' => now()]);
        $this->info("Retired $revoked Expo device(s).");
        return self::SUCCESS;
    }
}
