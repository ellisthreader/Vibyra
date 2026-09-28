<?php
namespace App\Jobs;
use App\Services\Notifications\{Devices, Inbox, Preferences};
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\{Crypt, DB, Http};
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
        if (!$p->{$item->category}) { $this->done('suppressed'); return; }
        if (app(Preferences::class)->quiet($p)) {
            $this->done('pending', ['next_at' => now()->addMinutes(5)]); return;
        }
        $destination = json_decode($item->destination, true);
        if ($device->visible_run === ($destination['runId'] ?? null) && $device->present_until && now()->lt($device->present_until)) {
            $this->done('suppressed'); return;
        }
        $ttl = app(Inbox::class)->deliveryTtl($item);
        if ($ttl < 1) { $this->done('suppressed'); return; }
        try {
            $r = Http::withToken((string) config('intelligence.expo_token'))->acceptJson()->timeout(10)
                ->post('https://exp.host/--/api/v2/push/send', ['to' => Crypt::decryptString($device->token),
                    'title' => $item->title, 'body' => 'Open Vibyra to review.', 'sound' => 'default',
                    'ttl' => $ttl,
                    'data' => ['version' => 1, 'notificationId' => $item->id]]);
            if ($r->status() === 429 || $r->serverError()) { $this->retry($d); return; }
            $body = $r->json('data');
            if ($r->successful() && ($body['status'] ?? null) === 'ok' && is_string($body['id'] ?? null)) {
                $this->done('ticketed', ['ticket' => $body['id'], 'next_at' => now()->addMinutes(15)]); return;
            }
            $error = $body['details']['error'] ?? 'PushRejected';
            if ($error === 'DeviceNotRegistered') DB::table('notification_devices')->where('id', $device->id)
                ->where('generation', $d->generation)->update(['revoked_at' => now()]);
            $this->done('failed', ['error' => in_array($error, ['DeviceNotRegistered','InvalidCredentials','MessageTooBig']) ? $error : 'PushRejected']);
        } catch (\Throwable) { $this->retry($d); }
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
