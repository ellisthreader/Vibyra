<?php

namespace App\Jobs;

use App\Models\User;
use App\Services\Notifications\Devices;
use App\Services\Remote\SecurityEvents;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\{Crypt, DB, Http, Mail};
use Illuminate\Support\Str;

/** Never includes screen, terminal, clipboard, key or token content. */
class DeliverRemoteSecurityNotification implements ShouldQueue
{
    use Queueable;
    public int $tries = 4;
    public int $timeout = 20;
    private ?string $claimId = null;
    public function __construct(public int $deliveryId) { $this->onQueue('notifications'); }
    public function backoff(): array { return [15, 60, 300]; }
    public function handle(): void
    {
        $this->claimId = (string) Str::uuid();
        $claimed = DB::table('security_event_deliveries')->where('id', $this->deliveryId)
            ->where(function ($query) {
                $query->where(fn ($q) => $q->where('status', 'pending')->where(fn ($due) => $due->whereNull('next_attempt_at')->orWhere('next_attempt_at', '<=', now())))
                    ->orWhere(fn ($q) => $q->where('status', 'processing')->where('claimed_at', '<', now()->subMinutes(2)));
            })->update(['status' => 'processing', 'claimed_at' => now(), 'claim_id' => $this->claimId, 'attempts' => DB::raw('attempts + 1')]);
        if (! $claimed) return;
        try { $this->deliver(); }
        catch (\Throwable) {
            $attempts = $this->claimed()->value('attempts');
            if ($attempts === null) return; // A replacement worker owns the delivery now.
            $this->claimed()->update([
                'status' => 'pending', 'next_attempt_at' => now()->addSeconds(min(3600, 15 * (2 ** min(8, $attempts))))]);
            throw new \RuntimeException('Security notification delivery unavailable');
        }
    }
    private function deliver(): void
    {
        $delivery = $this->claimed()->first();
        if (! $delivery || $delivery->status !== 'processing') return;
        $event = DB::table('security_events')->find($delivery->security_event_id);
        if (! $event || now()->diffInHours($event->created_at, true) > 24) { $this->done('expired'); return; }
        $user = User::find($event->user_id);
        if (! $user) { $this->done('suppressed'); return; }
        $title = app(SecurityEvents::class)->title($event->event_type);
        if ($delivery->channel === 'email') {
            if (! config('remote_security.email_notifications') || ! $user->hasVerifiedEmail()) { $this->done('suppressed'); return; }
            Mail::raw($title."\n\nRecorded at ".$event->created_at." UTC.\nOpen Vibyra → Settings → Security → Remote access to review or disconnect.",
                fn ($message) => $message->to($user->email)->subject('Vibyra: '.$title));
        } else {
            $device = DB::table('notification_devices')->where('id', $delivery->recipient)->where('user_id', $user->id)->first();
            if (! config('intelligence.push') || ! $device || $device->generation !== $delivery->generation || ! app(Devices::class)->eligible($device)) {
                $this->done('suppressed'); return;
            }
            $response = Http::withToken((string) config('intelligence.expo_token'))->acceptJson()->timeout(10)
                ->post('https://exp.host/--/api/v2/push/send', ['to' => Crypt::decryptString($device->token), 'title' => $title,
                    'body' => 'Open Vibyra to review remote access.', 'sound' => 'default', 'priority' => 'high', 'ttl' => 300,
                    'data' => ['version' => 1, 'securityEventId' => $event->uuid]]);
            if (! $this->claimed()->exists()) return;
            if ($response->status() === 429 || $response->serverError()) throw new \RuntimeException('Security notification delivery unavailable');
            if (! $response->successful() || $response->json('data.status') !== 'ok') {
                if ($response->json('data.details.error') === 'DeviceNotRegistered') DB::table('notification_devices')->where('id', $device->id)
                    ->where('generation', $delivery->generation)->update(['revoked_at' => now()]);
                $this->done('failed'); return;
            }
        }
        $this->done('accepted');
    }
    private function claimed(): \Illuminate\Database\Query\Builder
    {
        return DB::table('security_event_deliveries')->where('id', $this->deliveryId)
            ->where('claim_id', $this->claimId)->where('status', 'processing');
    }
    private function done(string $status): void
    {
        $this->claimed()->update(['status' => $status, 'accepted_at' => $status === 'accepted' ? now() : null]);
    }
}
