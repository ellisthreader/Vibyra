<?php
namespace App\Jobs;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\{DB, Http};
final class CheckPhoneReceipt implements ShouldQueue
{
    use Queueable;
    public int $tries = 1;
    public int $timeout = 20;
    public function __construct(public int $deliveryId) { $this->onQueue('notifications'); }
    public function handle(): void
    {
        $d = DB::table('notification_deliveries')->find($this->deliveryId);
        if (!$d || $d->state !== 'ticketed') return;
        if (now()->diffInHours($d->created_at, true) >= 23) { $this->finish($d, 'receipt_unknown'); return; }
        // Receipt checks continue when sending is disabled; they never send another alert.
        DB::table('notification_deliveries')->where('id', $d->id)->update(['next_at' => now()->addMinutes(15)]);
        try {
            $r = Http::withToken((string) config('intelligence.expo_token'))->timeout(10)
                ->post('https://exp.host/--/api/v2/push/getReceipts', ['ids' => [$d->ticket]]);
            $receipt = $r->json('data')[$d->ticket] ?? null;
            if (!$receipt) {
                if (now()->diffInHours($d->created_at, true) >= 23) $this->finish($d, 'receipt_unknown');
                return;
            }
            if (($receipt['status'] ?? null) === 'ok') { $this->finish($d, 'provider_accepted'); return; }
            $error = $receipt['details']['error'] ?? 'ReceiptError';
            if ($error === 'DeviceNotRegistered') DB::table('notification_devices')->where('id', $d->device_id)
                ->where('generation', $d->generation)->update(['revoked_at' => now()]);
            $this->finish($d, 'failed', $error === 'DeviceNotRegistered' ? $error : 'ReceiptError');
        } catch (\Throwable) { /* bounded by the receipt retention window; no content logging */ }
    }
    private function finish(object $d, string $state, ?string $error = null): void
    {
        DB::table('notification_deliveries')->where('id', $d->id)->where('state', 'ticketed')
            ->update(['state' => $state, 'error' => $error, 'updated_at' => now()]);
    }
}
