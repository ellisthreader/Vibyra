<?php
namespace App\Services\LiveStatus;

use Illuminate\Support\Facades\{Crypt, DB};

/**
 * Sends the account's Mac status to each registered iPhone: starts a card where there is none
 * and something is happening, updates it when it changed (or on a heartbeat so it never looks
 * frozen), alerts once per new waiting item, and ends it after a quiet spell. Never throws.
 */
final class Pusher
{
    public function __construct(private readonly Apns $apns) {}

    public function deliver(int $userId, ?int $now = null): void
    {
        if (!$this->apns->enabled()) return;
        $now ??= time();
        $row = DB::table('live_status_snapshots')->where('user_id', $userId)->first();
        if (!$row) return;
        $snap = json_decode((string) $row->snapshot, true) ?: [];
        $state = Card::state($snap, $now);
        $quietFor = $row->busy_at ? $now - strtotime((string) $row->busy_at) : PHP_INT_MAX;
        $over = $state['phase'] === 'idle' && $quietFor > 60 * (int) config('live_status.idle_end_minutes');
        foreach (DB::table('live_status_phones')->where('user_id', $userId)->get() as $phone) {
            try {
                $this->toPhone($phone, $state, $snap, (string) $row->mac_name, $over, $now, $this->notifiedElsewhere($userId, $phone));
            } catch (\Throwable) {
                // One phone's failure never blocks another, and never fails the Mac's request.
            }
        }
    }

    /**
     * The same iPhone gets an ordinary "needs you" notification for Mac work: then the card stays a
     * silent status (no alert on updates, no sound on push-to-start) so one event never buzzes twice.
     */
    private function notifiedElsewhere(int $userId, object $phone): bool
    {
        if (!MacEvents::enabled() || !config('intelligence.push')) return false;
        if (!DB::table('notification_preferences')->where('user_id', $userId)->value('attention')) return false;
        return DB::table('notification_devices')->where('user_id', $userId)->where('provider', 'apns')
            ->where('live_install_id', $phone->install_id)->whereNull('revoked_at')->exists();
    }

    private function toPhone(object $phone, array $state, array $snap, string $macName, bool $over, int $now, bool $silent = false): void
    {
        $signature = Card::signature($state);
        if ($phone->card_token) {
            if ($over) {
                $this->send($phone, $phone->card_token, Card::end($state, $now), 5, ['card_token' => null, 'card_hash' => null, 'last_state' => null, 'last_alert' => null]);
                return;
            }
            // Quiet but not yet over: keep showing the last activity rather than "nothing running".
            if ($state['phase'] === 'idle') return;
            $alertKey = Card::alertKey($snap);
            $alert = !$silent && $alertKey && $alertKey !== $phone->last_alert ? Card::alert($state) : null;
            $heartbeat = !$phone->last_sent_at || $now - strtotime((string) $phone->last_sent_at) > 60 * (int) config('live_status.heartbeat_minutes');
            if (!$alert && $signature === $phone->last_state && !$heartbeat) return;
            $this->send($phone, $phone->card_token, Card::update($state, $alert, $now), $alert ? 10 : 5,
                ['last_state' => $signature, 'last_alert' => $alertKey, 'last_sent_at' => now()], fn () => ['card_token' => null, 'card_hash' => null]);
            return;
        }
        // No card yet: start one, but only when something is happening and not more than once every 2 minutes.
        if ($over || $state['phase'] === 'idle' || !$phone->start_token) return;
        if ($phone->last_start_at && $now - strtotime((string) $phone->last_start_at) < 120) return;
        $this->send($phone, $phone->start_token, Card::start($state, $macName, $now, $silent), 10,
            ['last_start_at' => now(), 'last_state' => $signature, 'last_alert' => Card::alertKey($snap), 'last_sent_at' => now()],
            fn () => ['start_token' => null, 'start_hash' => null]);
    }

    /** @param ?callable():array $onDeadToken columns to clear when Apple says the token is gone */
    private function send(object $phone, string $encrypted, array $payload, int $priority, array $onOk, ?callable $onDeadToken = null): void
    {
        $result = $this->apns->send(Crypt::decryptString($encrypted), $payload, $priority, $phone->apns_host);
        if ($result['status'] === 200) {
            DB::table('live_status_phones')->where('id', $phone->id)->update([...$onOk, 'apns_host' => $result['host'], 'updated_at' => now()]);
        } elseif ($onDeadToken && ($result['status'] === 410 || in_array($result['reason'], ['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'], true))) {
            DB::table('live_status_phones')->where('id', $phone->id)->update([...$onDeadToken(), 'updated_at' => now()]);
        }
        // 429, 5xx or no answer: leave everything; the next snapshot or heartbeat sends the then-current state.
    }
}
