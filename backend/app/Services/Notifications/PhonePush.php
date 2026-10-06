<?php
namespace App\Services\Notifications;

use App\Services\LiveStatus\{Apns, Card};
use Illuminate\Support\Facades\{Crypt, DB, Http};

/**
 * Sends one notification to one phone. APNs devices get a direct `alert` push (names and states
 * only; the item id travels under the top-level `body` key, which expo-notifications exposes as
 * `content.data`). Legacy Expo devices are used only while an Expo access token is configured.
 *
 * Every send answers with what the outbox row should become:
 * accepted | ticketed (Expo, with ticket) | retry | failed | suppressed (+ error).
 * A token Apple or Expo says is gone is revoked here, guarded by the delivery's generation.
 */
final class PhonePush
{
    private const DEAD = ['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'];

    public function __construct(private readonly Apns $apns) {}

    /** @return array{state:string,error?:?string,ticket?:string} */
    public function item(object $device, object $item, int $ttl, int $generation): array
    {
        if (($device->provider ?? 'expo') !== 'apns') return $this->expoItem($device, $item, $ttl, $generation);
        if (!$this->apns->alertsEnabled()) return ['state' => 'suppressed', 'error' => 'PushUnavailable'];
        $payload = $this->payload($item);
        $collapse = $item->thread ?? null;
        return $this->apnsSend($device, $payload, $collapse, $ttl, $generation);
    }

    /** @return array{state:string,error?:?string,ticket?:string} */
    public function security(object $device, string $title, string $eventId, int $generation): array
    {
        $body = 'Open Vibyra to review remote access.';
        if (($device->provider ?? 'expo') !== 'apns') {
            if (!$this->expoReady()) return ['state' => 'suppressed', 'error' => 'PushUnavailable'];
            $r = Http::withToken((string) config('intelligence.expo_token'))->acceptJson()->timeout(10)
                ->post('https://exp.host/--/api/v2/push/send', ['to' => Crypt::decryptString($device->token), 'title' => $title,
                    'body' => $body, 'sound' => 'default', 'priority' => 'high', 'ttl' => 300,
                    'data' => ['version' => 1, 'securityEventId' => $eventId]]);
            if ($r->status() === 429 || $r->serverError()) return ['state' => 'retry'];
            if ($r->successful() && $r->json('data.status') === 'ok') return ['state' => 'accepted'];
            if ($r->json('data.details.error') === 'DeviceNotRegistered') $this->revoke($device, $generation);
            return ['state' => 'failed', 'error' => 'PushRejected'];
        }
        if (!$this->apns->alertsEnabled()) return ['state' => 'suppressed', 'error' => 'PushUnavailable'];
        $payload = ['aps' => ['alert' => ['title' => Card::text($title, 120), 'body' => $body], 'sound' => 'default',
            'thread-id' => 'security', 'interruption-level' => 'active'],
            'body' => ['version' => 1, 'securityEventId' => $eventId]];
        return $this->apnsSend($device, $payload, 'security:'.$eventId, 300, $generation);
    }

    /** The exact APNs payload for an inbox item (PLAN §3.2). */
    public function payload(object $item): array
    {
        $destination = json_decode((string) $item->destination, true) ?: [];
        $event = DB::table('work_events')->where('id', $item->event_id)->first(['metadata']);
        $summary = $event ? (json_decode((string) $event->metadata, true)['summary'] ?? null) : null;
        $level = is_array($summary) ? ($summary['level'] ?? 'active') : $this->level($item, $destination);
        $alert = is_array($summary)
            ? ['title' => (string) $summary['title'], 'body' => (string) ($summary['body'] ?? '')]
            : ['title' => (string) $item->title, 'body' => (string) ($item->body ?? 'Open Vibyra to review.')];
        if ($alert['body'] === '') unset($alert['body']);
        return ['aps' => ['alert' => $alert, 'sound' => 'default', 'badge' => $this->badge((int) $item->user_id),
            'thread-id' => $this->thread($item, $destination), 'interruption-level' => $level,
            'relevance-score' => match (true) { $level === 'time-sensitive' || $item->category === 'attention' => 1, $item->category === 'failures' => 0.7, default => 0.5 }],
            'body' => ['version' => 1, 'notificationId' => (string) $item->id]];
    }

    /** Unread items that still need the person (category attention, still current). */
    public function badge(int $userId): int
    {
        $inbox = app(Inbox::class);
        return DB::table('notification_items')->where('user_id', $userId)->where('category', 'attention')->whereNull('read_at')
            ->where('expires_at', '>', now())->orderByDesc('created_at')->limit(50)->get()
            ->filter(fn ($i) => $inbox->current($i))->count();
    }

    /** True when the account already had its hourly share of pushed alerts (all devices count once per item). */
    public function rateLimited(int $userId): bool
    {
        $sent = DB::table('notification_deliveries')->join('notification_items', 'notification_items.id', '=', 'notification_deliveries.item_id')
            ->where('notification_items.user_id', $userId)
            ->whereIn('notification_deliveries.state', ['accepted', 'ticketed', 'provider_accepted', 'receipt_unknown'])
            ->where('notification_deliveries.updated_at', '>', now()->subHour())
            ->distinct()->count('notification_deliveries.item_id');
        return $sent >= (int) config('intelligence.alert_rate_per_hour', 20);
    }

    private function level(object $item, array $destination): string
    {
        if (in_array($item->level ?? null, ['passive', 'active', 'time-sensitive'], true)) return $item->level;
        if (($destination['source'] ?? null) === 'cloud_computer' && in_array($destination['event'] ?? null, ['approval.needed', 'login.needed'], true)) return 'time-sensitive';
        return 'active';
    }

    private function thread(object $item, array $destination): string
    {
        if (!empty($item->thread)) return (string) $item->thread;
        $source = (string) ($destination['source'] ?? 'vibyra');
        $id = $destination['workspaceId'] ?? $destination['runId'] ?? null;
        return substr($source === 'cloud_computer' ? 'cloud:'.($id ?? '') : $source.($id ? ':'.$id : ''), 0, 64);
    }

    /** @return array{state:string,error?:?string} */
    private function apnsSend(object $device, array $payload, ?string $collapse, int $ttl, int $generation): array
    {
        $hint = $device->apns_host ?? (($device->environment ?? null) === 'sandbox' ? 'sandbox' : 'production');
        $r = $this->apns->sendAlert(Crypt::decryptString($device->token), $payload, 10, $hint, $collapse, $ttl);
        if ($r['status'] === 200) {
            if (($device->apns_host ?? null) !== $r['host']) DB::table('notification_devices')->where('id', $device->id)->update(['apns_host' => $r['host']]);
            return ['state' => 'accepted'];
        }
        if ($r['status'] === 410 || in_array($r['reason'], self::DEAD, true)) {
            $this->revoke($device, $generation);
            return ['state' => 'failed', 'error' => $r['status'] === 410 ? 'Unregistered' : (string) $r['reason']];
        }
        if ($r['status'] === 0 || $r['status'] === 429 || $r['status'] >= 500 || $r['status'] === 403) return ['state' => 'retry'];
        return ['state' => 'failed', 'error' => in_array($r['reason'], ['PayloadTooLarge', 'BadCollapseId', 'BadTopic', 'TopicDisallowed'], true) ? $r['reason'] : 'PushRejected'];
    }

    /** @return array{state:string,error?:?string,ticket?:string} */
    private function expoItem(object $device, object $item, int $ttl, int $generation): array
    {
        if (!$this->expoReady()) return ['state' => 'suppressed', 'error' => 'PushUnavailable'];
        $r = Http::withToken((string) config('intelligence.expo_token'))->acceptJson()->timeout(10)
            ->post('https://exp.host/--/api/v2/push/send', ['to' => Crypt::decryptString($device->token),
                'title' => $item->title, 'body' => $item->body ?? 'Open Vibyra to review.', 'sound' => 'default',
                'ttl' => $ttl, 'data' => ['version' => 1, 'notificationId' => $item->id]]);
        if ($r->status() === 429 || $r->serverError()) return ['state' => 'retry'];
        $body = $r->json('data');
        if ($r->successful() && ($body['status'] ?? null) === 'ok' && is_string($body['id'] ?? null)) return ['state' => 'ticketed', 'ticket' => $body['id']];
        $error = $body['details']['error'] ?? 'PushRejected';
        if ($error === 'DeviceNotRegistered') $this->revoke($device, $generation);
        return ['state' => 'failed', 'error' => in_array($error, ['DeviceNotRegistered', 'InvalidCredentials', 'MessageTooBig'], true) ? $error : 'PushRejected'];
    }

    private function expoReady(): bool
    {
        return (bool) config('intelligence.push') && (string) config('intelligence.expo_token') !== '';
    }

    private function revoke(object $device, int $generation): void
    {
        DB::table('notification_devices')->where('id', $device->id)->where('generation', $generation)->update(['revoked_at' => now()]);
    }
}
