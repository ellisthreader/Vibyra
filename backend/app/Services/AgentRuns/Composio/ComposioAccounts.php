<?php

namespace App\Services\AgentRuns\Composio;

use App\Models\AgentV2\Connection;
use App\Services\AgentRuns\ApiError;
use App\Services\ChatConnectors\OAuthFlows;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

/**
 * Linking a person's own account for a reviewed Composio toolkit. Composio hosts
 * the provider sign-in (a connect link for our auth config and this account's
 * opaque `user_id`) and returns the browser to our callback; the linked account is
 * accepted only if Composio reports it ACTIVE, for this user_id, auth config and
 * toolkit, and it is the exact account this flow started.
 */
final class ComposioAccounts
{
    public function __construct(private readonly ComposioCatalog $catalog, private readonly ComposioApi $api,
        private readonly OAuthFlows $flows) {}

    public function start(int $userId, string $toolkit, ?string $returnUrl): array
    {
        $reason = $this->catalog->unavailableReason($toolkit);
        if ($reason === 'unknown_provider') ApiError::throw(404, 'unknown_provider', 'That integration is not available to teammates.');
        if ($reason) ApiError::throw(409, 'provider_unavailable', $this->catalog->message($reason));
        $flow = $this->flows->begin($userId, $returnUrl, ['kind' => 'composio', 'toolkit' => $toolkit, 'slug' => 'composio_'.$toolkit]);
        $callback = rtrim((string) config('app.url'), '/').'/api/agents/v2/composio/callback?'.http_build_query(['state' => $flow['state']]);
        try {
            $link = $this->api->link((string) $this->catalog->spec($toolkit)['auth_config'], $this->catalog->userId($userId), $callback);
        } catch (\Throwable) {
            ApiError::throw(502, 'provider_unavailable', 'Composio could not start the sign-in. Try again shortly.');
        }
        $url = $link['redirect_url'] ?? null;
        $account = $link['connected_account_id'] ?? null;
        if (!is_string($url) || !str_starts_with($url, 'https://') || !is_string($account))
            ApiError::throw(502, 'provider_unavailable', 'Composio did not return a sign-in link.');
        Cache::put('agents-v2:composio:flow:'.$flow['flowId'], $account, now()->addMinutes(OAuthFlows::MINUTES));
        return ['flowId' => $flow['flowId'], 'url' => $this->flows->entry($flow, $url, '/api/agents/v2/composio/callback',
            (string) ($this->catalog->spec($toolkit)['name'] ?? $toolkit))];
    }

    /** The browser is back. Returns the flow (for the return link) or null for an unknown/replayed state. */
    public function finish(string $state, string $status, string $binding = ''): ?array
    {
        $flow = $this->flows->claim($state, $binding);
        if (!$flow || ($flow['kind'] ?? '') !== 'composio') return null;
        $expected = Cache::pull('agents-v2:composio:flow:'.$flow['flowId']);
        $toolkit = (string) $flow['toolkit'];
        $userId = (int) $flow['userId'];
        if (!is_string($expected) || strtolower($status) === 'failed') {
            $this->flows->fail($flow, 'The sign-in did not finish. Please try again.');
            return $flow;
        }
        try {
            $account = $this->api->owned($expected, $userId, $toolkit);
        } catch (\Throwable) {
            $this->flows->fail($flow, 'Composio did not confirm this account for you. Please try again.');
            return $flow;
        }
        $row = $this->store($userId, $toolkit, $expected, $account);
        $this->flows->succeed($flow, ['connectionId' => $row->id]);
        return $flow;
    }

    private function store(int $userId, string $toolkit, string $accountId, array $account): Connection
    {
        $provider = 'composio_'.$toolkit;
        $identity = (string) ($account['data']['email'] ?? $account['data']['account_email'] ?? ($this->catalog->spec($toolkit)['name']
            ?? $toolkit).' · '.substr(hash('sha256', $accountId), 0, 6));
        return DB::transaction(function () use ($userId, $provider, $accountId, $identity) {
            $credential = 'u'.$userId.':'.$accountId;
            // A first link of an identity has no row to lock: two completions at once each created a connection. Serialize on the user row.
            DB::table('users')->where('id', $userId)->lockForUpdate()->first();
            $existing = Connection::query()->where('user_id', $userId)->where('provider', $provider)
                ->where('external_identity', $identity)->whereNull('revoked_at')->lockForUpdate()->first();
            if ($existing) {
                $existing->forceFill(['credential' => Crypt::encryptString($credential), 'health' => 'healthy',
                    'generation' => $existing->generation + 1])->save();
                return $existing;
            }
            return Connection::query()->create(['user_id' => $userId, 'provider' => $provider, 'external_identity' => $identity,
                'credential' => Crypt::encryptString($credential), 'health' => 'healthy', 'generation' => 1, 'capability_revision' => 1]);
        });
    }
}
