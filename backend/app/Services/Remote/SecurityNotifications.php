<?php

namespace App\Services\Remote;

use App\Jobs\DeliverRemoteSecurityNotification;
use Illuminate\Support\Facades\DB;

class SecurityNotifications
{
    public function enqueue(int $event, int $user): void
    {
        // Queue active-session warnings for phones before optional email work.
        if (config('intelligence.push')) {
            foreach (DB::table('notification_devices')->where('user_id', $user)->whereNull('revoked_at')->get() as $device) {
                $this->delivery($event, 'push', $device->id, $device->generation);
            }
        }
        if (config('remote_security.email_notifications')) $this->delivery($event, 'email', (string) $user, 0);
    }

    private function delivery(int $event, string $channel, string $recipient, int $generation): void
    {
        $id = DB::table('security_event_deliveries')->insertGetId(['security_event_id' => $event,
            'channel' => $channel, 'recipient' => $recipient, 'generation' => $generation, 'created_at' => now()]);
        DB::afterCommit(function () use ($id): void {
            try { DeliverRemoteSecurityNotification::dispatch($id); }
            catch (\Throwable) {
                // The durable delivery row is retried by the scheduler. A
                // mail/queue outage must not change an authorization result.
            }
        });
    }
}
