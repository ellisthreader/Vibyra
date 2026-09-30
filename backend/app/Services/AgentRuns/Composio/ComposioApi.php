<?php

namespace App\Services\AgentRuns\Composio;

use App\Services\AgentRuns\Tools\Providers\ToolFailure;
use App\Services\ChatConnectors\ReconnectRequired;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/**
 * Composio v3 REST calls on the platform key: connected-account links, the
 * isolation check, disconnect and tool execution. A refusal of OUR key is not the
 * person's problem (`credential_unavailable`); an expired or inactive connected
 * account needs the person to link again. Answers are capped at 200 KB.
 */
final class ComposioApi
{
    private const MAX_BYTES = 200_000;

    public function __construct(private readonly ComposioCatalog $catalog) {}

    public function link(string $authConfig, string $userId, string $callback): array
    {
        return $this->send('post', '/connected_accounts/link', ['auth_config_id' => $authConfig, 'user_id' => $userId,
            'callback_url' => $callback], true);
    }

    /**
     * The connected account, only when it is ACTIVE and belongs to this Vibyra account,
     * this toolkit and our auth config. This is the per-user isolation check.
     */
    public function owned(string $accountId, int $userId, string $toolkit): array
    {
        abort_unless(preg_match('/^[A-Za-z0-9_-]{4,80}$/D', $accountId), 422, 'That Composio account id is invalid.');
        $a = $this->send('get', '/connected_accounts/'.$accountId, [], false);
        $config = (string) ($this->catalog->spec($toolkit)['auth_config'] ?? '');
        if (($a['user_id'] ?? null) !== $this->catalog->userId($userId) || ($a['auth_config']['id'] ?? null) !== $config
            || strtolower((string) ($a['toolkit']['slug'] ?? '')) !== $toolkit)
            throw ToolFailure::refused('forbidden', 'That Composio account does not belong to this Vibyra account.');
        if (($a['status'] ?? null) !== 'ACTIVE') throw ReconnectRequired::for('composio_'.$toolkit);
        return $a;
    }

    public function disconnect(string $accountId): void
    {
        try { $this->send('delete', '/connected_accounts/'.$accountId, [], true); }
        catch (\Throwable) {} // Local revocation already happened; a remote cleanup failure never restores access.
    }

    public function execute(string $slug, string $accountId, string $userId, array $arguments, bool $write): array
    {
        return $this->send('post', '/tools/execute/'.$slug, ['connected_account_id' => $accountId, 'user_id' => $userId,
            'arguments' => (object) $arguments], $write);
    }

    private function send(string $method, string $path, array $body, bool $write): array
    {
        $key = (string) config('chat_connectors.composio_api_key', '');
        if ($key === '') throw ToolFailure::refused('credential_unavailable', 'Composio is not set up in this environment.');
        try {
            $response = Http::withHeaders(['x-api-key' => $key])->acceptJson()->asJson()->timeout(15)
                ->withOptions(['allow_redirects' => false])->{$method}(rtrim((string) config('agents_v2_composio.base_url'), '/').$path, $body);
        } catch (ConnectionException) {
            throw $write ? ToolFailure::unknown('Composio') : ToolFailure::retryable('Composio did not respond in time.');
        }
        $status = $response->status();
        if (strlen($response->body()) > self::MAX_BYTES) throw $write ? ToolFailure::unknown('Composio')
            : ToolFailure::refused('too_large', 'Composio returned more than this tool may read.');
        if ($status === 429) throw ToolFailure::rateLimited('Composio', is_numeric($response->header('Retry-After')) ? (int) $response->header('Retry-After') : null);
        if ($status === 401 || $status === 403) throw ToolFailure::refused('credential_unavailable', 'Composio refused the platform key.');
        if ($status === 404) throw ToolFailure::refused('not_found', 'Composio could not find that account or tool.');
        if ($status >= 500) throw $write ? ToolFailure::unknown('Composio') : ToolFailure::retryable('Composio had a temporary problem.');
        $data = $response->json();
        if ($status === 204 || ($method === 'delete' && $response->successful())) return [];
        if (!$response->successful()) throw ToolFailure::refused('invalid_request', 'Composio refused this request as invalid.');
        if (!is_array($data)) throw $write ? ToolFailure::unknown('Composio') : ToolFailure::retryable('Composio returned an unreadable answer.');
        return $data;
    }
}
