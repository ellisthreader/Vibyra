<?php
namespace App\Jobs;
use App\Services\Notifications\{Devices, Inbox, PhonePush, Preferences};
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
final class DeliverPhoneNotification implements ShouldQueue
{
    use Queueable;
    public int $tries = 1;
    public int $timeout = 20;
    public function __construct(public int $deliveryId) { $this->onQueue('notifications'); }
    public function handle(): void
    {
        if (!config('intelligence.push')) return;
        $claimed = DB::table('notification_deliveries')->where('id', $this->deliveryId)->where('state', 'pending')
            ->where('next_at', '<=', now())->update(['state' => 'sending', 'claimed_at' => now(), 'updated_at' => now()]);
        if (!$claimed) return;
        $d = DB::table('notification_deliveries')->find($this->deliveryId);
        $item = DB::table('notification_items')->where('id', $d->item_id)->first();
        $device = DB::table('notification_devices')->where('id', $d->device_id)->first();
        if (!$item || !$device || $device->user_id !== $item->user_id || $device->generation !== $d->generation
            || !app(Devices::class)->eligible($device) || !app(Inbox::class)->current($item)) { $this->done('suppressed'); return; }
        $p = app(Preferences::class)->get($item->user_id);
        $phase = DB::table('work_events')->where('id', $item->event_id)->value('phase');
        if (!app(Preferences::class)->allows($p, $item->category, $phase)) { $this->done('suppressed'); return; }
        if (app(Preferences::class)->quiet($p)) {
            $this->done('pending', ['next_at' => now()->addMinutes(5)]); return;
        }
        $destination = json_decode($item->destination, true);
        if ($device->visible_run === ($destination['runId'] ?? null) && $device->present_until && now()->lt($device->present_until)) {
            $this->done('suppressed'); return;
        }
        $ttl = app(Inbox::class)->deliveryTtl($item);
        if ($ttl < 1) { $this->done('suppressed'); return; }
        // Overflow stays in the inbox; the person still sees it on the next open.
        if (app(PhonePush::class)->rateLimited((int) $item->user_id)) { $this->done('suppressed', ['error' => 'RateLimited']); return; }
        try {
            $r = app(PhonePush::class)->item($device, $item, $ttl, (int) $d->generation);
        } catch (\Throwable) {
            // No receipt means it may already have reached the phone. Keep the
            // inbox item, but never replay an uncertain OS notification.
            $this->done('failed', ['error' => 'DeliveryUnconfirmed']); return;
        }
        match ($r['state']) {
            'retry' => $this->retry($d),
            'ticketed' => $this->done('ticketed', ['ticket' => $r['ticket'], 'next_at' => now()->addMinutes(15)]),
            'accepted' => $this->done('accepted', ['error' => null]),
            default => $this->done($r['state'], ['error' => $r['error'] ?? null]),
        };
    }
    private function retry(object $d): void
    {
        $attempts = $d->attempts + 1;
        $this->done($attempts >= 4 ? 'failed' : 'pending', ['attempts' => $attempts, 'error' => 'DeliveryUnconfirmed',
            'next_at' => now()->addSeconds(min(900, 15 * 2 ** $attempts) + random_int(0, 10))]);
    }
    private function done(string $state, array $extra = []): void
    {
        DB::table('notification_deliveries')->where('id', $this->deliveryId)->update(['state' => $state, 'updated_at' => now(), ...$extra]);
    }
}
