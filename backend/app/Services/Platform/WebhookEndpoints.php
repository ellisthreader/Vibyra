<?php

namespace App\Services\Platform;

use App\Models\WebhookDelivery;
use App\Models\WebhookEndpoint;
use App\Services\AgentRuns\ApiError;
use App\Services\AgentRuns\Mcp\McpError;
use App\Services\AgentRuns\Mcp\SafeHttp;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * An account's outbound webhook endpoints. The address is checked against the same SSRF policy as MCP servers (public HTTPS on
 * 443, every resolved address public) when it is saved and again before every delivery. The signing secret is generated here,
 * encrypted at rest, and shown once.
 */
final class WebhookEndpoints
{
    public const EVENTS = ['run.started', 'run.completed', 'run.failed', 'run.needs_approval'];

    public function __construct(private readonly SafeHttp $http) {}

    public static function enabled(): bool
    {
        return (bool) config('platform.webhooks');
    }

    /** @return array{0: WebhookEndpoint, 1: string} the endpoint and its secret, to be shown once */
    public function create(int $userId, string $url, array $events): array
    {
        $events = array_values(array_unique($events));
        if ($events === [] || array_diff($events, self::EVENTS) !== []) ApiError::throw(422, 'invalid_events', 'Choose from: '.implode(', ', self::EVENTS).'.');
        try { $this->http->check($url); }
        catch (McpError) { ApiError::throw(422, 'blocked_destination', 'Use a public HTTPS address (port 443).'); }
        $secret = 'whsec_vy_'.Str::random(32);
        $endpoint = DB::transaction(function () use ($userId, $url, $events, $secret) {
            DB::table('users')->where('id', $userId)->lockForUpdate()->first();
            if (WebhookEndpoint::query()->where('user_id', $userId)->whereNull('deleted_at')->count() >= (int) config('platform.max_webhooks'))
                ApiError::throw(409, 'webhook_limit', 'Remove a webhook before adding another.');
            return WebhookEndpoint::query()->create(['user_id' => $userId, 'url' => $url, 'secret' => Crypt::encryptString($secret), 'events' => $events]);
        });
        AccountActivity::record($userId, 'webhook.created', ['host' => (string) parse_url($url, PHP_URL_HOST), 'events' => $events]);
        return [$endpoint, $secret];
    }

    public function find(int $userId, string $id): WebhookEndpoint
    {
        $endpoint = WebhookEndpoint::query()->where('user_id', $userId)->whereKey($id)->whereNull('deleted_at')->first();
        if (!$endpoint) ApiError::throw(404, 'webhook_not_found', 'That webhook does not exist.');
        return $endpoint;
    }

    public function pause(int $userId, string $id, bool $paused): WebhookEndpoint
    {
        $endpoint = $this->find($userId, $id);
        $endpoint->forceFill($paused ? ['paused_at' => $endpoint->paused_at ?? now(), 'paused_reason' => $endpoint->paused_reason ?? 'manual']
            : ['paused_at' => null, 'paused_reason' => null, 'failures' => 0])->save();
        AccountActivity::record($userId, $paused ? 'webhook.paused' : 'webhook.resumed', ['host' => (string) parse_url($endpoint->url, PHP_URL_HOST)]);
        return $endpoint;
    }

    public function delete(int $userId, string $id): void
    {
        $endpoint = $this->find($userId, $id);
        $endpoint->forceFill(['deleted_at' => now()])->save();
        WebhookDelivery::query()->where('endpoint_id', $endpoint->id)->where('state', 'pending')->update(['state' => 'abandoned']);
        AccountActivity::record($userId, 'webhook.deleted', ['host' => (string) parse_url($endpoint->url, PHP_URL_HOST)]);
    }

    /** @return WebhookEndpoint[] */
    public function list(int $userId): array
    {
        return WebhookEndpoint::query()->where('user_id', $userId)->whereNull('deleted_at')->orderBy('created_at')->limit(20)->get()->all();
    }

    /** @return WebhookDelivery[] newest first */
    public function deliveries(int $userId, string $id): array
    {
        $endpoint = $this->find($userId, $id);
        return WebhookDelivery::query()->where('endpoint_id', $endpoint->id)->orderByDesc('created_at')->orderByDesc('id')->limit(50)->get()->all();
    }

    public function payload(WebhookEndpoint $e): array
    {
        return ['id' => $e->id, 'url' => $e->url, 'events' => $e->events, 'paused' => $e->paused_at !== null, 'pausedReason' => $e->paused_reason,
            'failures' => $e->failures, 'createdAt' => $e->created_at?->toIso8601String()];
    }

    public function deliveryPayload(WebhookDelivery $d): array
    {
        return ['id' => $d->id, 'event' => $d->event, 'state' => $d->state, 'attempts' => $d->attempts, 'status' => $d->response_status,
            'error' => $d->error, 'nextAttemptAt' => $d->state === 'pending' ? $d->next_attempt_at?->toIso8601String() : null,
            'deliveredAt' => $d->delivered_at?->toIso8601String(), 'createdAt' => $d->created_at?->toIso8601String()];
    }
}
