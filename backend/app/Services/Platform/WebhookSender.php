<?php

namespace App\Services\Platform;

use App\Jobs\DeliverPlatformWebhook;
use App\Models\WebhookDelivery;
use App\Models\WebhookEndpoint;
use App\Services\AgentRuns\Mcp\McpError;
use App\Services\AgentRuns\Mcp\SafeHttp;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

/**
 * Signs and sends one delivery. Headers: `Vibyra-Timestamp` (unix seconds), `Vibyra-Signature: v1=<hex>` where the hex is
 * HMAC-SHA256(secret, "<timestamp>.<raw body>"), `Vibyra-Event`, `Vibyra-Delivery`. A 2xx is delivery. Anything else retries with
 * exponential backoff (30s, 60s, 2m, 4m, 8m); six failed attempts end the delivery as `failed`, and five ended deliveries in a
 * row pause the endpoint. An attempt claims the row first, so parallel workers or the sweeper never double-send.
 */
final class WebhookSender
{
    private const CLAIM_SECONDS = 90;

    public function __construct(private readonly SafeHttp $http) {}

    public function attempt(string $deliveryId): void
    {
        $claimed = DB::transaction(function () use ($deliveryId) {
            $d = WebhookDelivery::query()->whereKey($deliveryId)->lockForUpdate()->first();
            if (!$d || $d->state !== 'pending' || ($d->next_attempt_at && $d->next_attempt_at->isFuture())) return null;
            $endpoint = WebhookEndpoint::query()->whereKey($d->endpoint_id)->first();
            if (!$endpoint || $endpoint->deleted_at || $endpoint->paused_at) {
                $d->forceFill(['state' => 'abandoned', 'error' => $endpoint?->paused_at ? 'paused' : 'removed'])->save();
                return null;
            }
            $d->forceFill(['next_attempt_at' => now()->addSeconds(self::CLAIM_SECONDS)])->save();
            return [$d, $endpoint];
        });
        if (!$claimed) return;
        [$d, $endpoint] = $claimed;
        [$status, $error] = $this->send($d, $endpoint);
        $d->attempts++;
        $d->response_status = $status;
        if ($status !== null && $status >= 200 && $status < 300) {
            $d->forceFill(['state' => 'delivered', 'error' => null, 'delivered_at' => now(), 'next_attempt_at' => null])->save();
            WebhookEndpoint::query()->whereKey($endpoint->id)->update(['failures' => 0]);
            return;
        }
        $d->error = $error ?? 'http_'.$status;
        if ($d->attempts >= (int) config('platform.webhook_attempts')) {
            $d->forceFill(['state' => 'failed', 'next_attempt_at' => null])->save();
            if (class_exists(\App\Services\Reliability\FailureAlerts::class))
                \App\Services\Reliability\FailureAlerts::exhausted('PlatformWebhookDelivery');
            else \Illuminate\Support\Facades\Log::warning('Platform webhook delivery exhausted its retries.');
            $this->endpointFailed($endpoint);
            return;
        }
        $wait = (int) config('platform.webhook_backoff_seconds') * (2 ** ($d->attempts - 1));
        $d->forceFill(['next_attempt_at' => now()->addSeconds($wait)])->save();
        DeliverPlatformWebhook::dispatch($d->id)->delay(now()->addSeconds($wait));
    }

    /** Safety net for a lost queue message or a worker that died mid-send: re-offer everything that is due. */
    public function sweep(int $limit = 100): int
    {
        $ids = WebhookDelivery::query()->where('state', 'pending')->where(fn ($q) => $q->whereNull('next_attempt_at')->orWhere('next_attempt_at', '<=', now()))
            ->orderBy('created_at')->limit($limit)->pluck('id');
        foreach ($ids as $id) DeliverPlatformWebhook::dispatch($id);
        return $ids->count();
    }

    public static function sign(string $secret, int $timestamp, string $raw): string
    {
        return 'v1='.hash_hmac('sha256', $timestamp.'.'.$raw, $secret);
    }

    /** @return array{0: ?int, 1: ?string} HTTP status and a short machine reason when nothing answered */
    private function send(WebhookDelivery $d, WebhookEndpoint $endpoint): array
    {
        $raw = json_encode($d->payload, JSON_UNESCAPED_SLASHES);
        $timestamp = time();
        $headers = ['Vibyra-Timestamp' => (string) $timestamp, 'Vibyra-Signature' => self::sign(Crypt::decryptString($endpoint->secret), $timestamp, $raw),
            'Vibyra-Event' => $d->event, 'Vibyra-Delivery' => $d->id, 'User-Agent' => 'Vibyra-Webhooks/1', 'Accept' => 'application/json'];
        try {
            return [$this->http->send('POST', $endpoint->url, ['headers' => $headers, 'raw' => $raw])->status(), null];
        } catch (McpError $e) {
            return [null, $e->reason];
        }
    }

    private function endpointFailed(WebhookEndpoint $endpoint): void
    {
        $paused = DB::transaction(function () use ($endpoint) {
            $row = WebhookEndpoint::query()->whereKey($endpoint->id)->lockForUpdate()->first();
            if (!$row) return false;
            $row->failures++;
            $pause = $row->failures >= (int) config('platform.webhook_pause_after') && !$row->paused_at;
            if ($pause) $row->forceFill(['paused_at' => now(), 'paused_reason' => 'failing']);
            $row->save();
            return $pause;
        });
        if ($paused) AccountActivity::record($endpoint->user_id, 'webhook.paused', ['host' => (string) parse_url($endpoint->url, PHP_URL_HOST), 'reason' => 'failing'], 'system');
    }
}
