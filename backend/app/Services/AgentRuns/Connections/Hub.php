<?php

namespace App\Services\AgentRuns\Connections;

use App\Models\AgentV2\Connection;
use App\Models\AgentV2\McpServer;
use Illuminate\Support\Facades\DB;

/**
 * The connections hub: every active connection with its account, one status a
 * person can act on, scopes, which teammates hold grants, when a teammate last
 * used it, and how to reconnect. `health` stays as the Stage 1 field; `status`
 * is the hub's summary:
 *
 * - `ok`                  usable
 * - `reconnect_required`  the provider refused the sign-in (or an MCP server awaits it)
 * - `insufficient_scope`  the provider refused a permission on this credential generation
 * - `needs_review`        a remote MCP server changed its tools (review, then re-grant)
 * - `unconfigured`        this environment cannot serve the provider (see catalogue readiness)
 */
final class Hub
{
    public function __construct(private readonly Connections $connections, private readonly Readiness $readiness) {}

    public function list(int $userId): array
    {
        $rows = $this->connections->active($userId);
        $ids = array_map(fn (Connection $c) => $c->id, $rows);
        $teammates = DB::table('agent_grants')->join('agent_teammates', 'agent_teammates.id', '=', 'agent_grants.agent_id')
            ->where('agent_grants.user_id', $userId)->whereIn('agent_grants.connection_id', $ids)->whereNull('agent_grants.revoked_at')
            ->orderBy('agent_teammates.name')->get(['agent_grants.connection_id', 'agent_grants.agent_id', 'agent_teammates.name',
                'agent_grants.operations', 'agent_grants.revision'])->groupBy('connection_id');
        $used = DB::table('agent_tool_actions')->where('user_id', $userId)->whereIn('connection_id', $ids)
            ->whereIn('state', ['completed', 'failed', 'unknown'])->groupBy('connection_id')
            ->selectRaw('connection_id, max(updated_at) as last')->pluck('last', 'connection_id');
        $servers = McpServer::query()->whereIn('connection_id', $ids)->get()->keyBy('connection_id');
        $states = [];
        return array_map(function (Connection $c) use ($teammates, $used, $servers, &$states) {
            $server = $servers[$c->id] ?? null;
            $family = $server && $server->kind === 'remote' ? 'mcp' : $c->provider;
            $ready = ($states[$family] ??= $this->readiness->state($family))['readiness'] === 'ready';
            $status = $this->status($c, $ready);
            return [...$this->connections->payload($c), 'status' => $status,
                'name' => $server?->name ?? (string) config('chat_connectors.catalogue.'.$c->provider.'.name',
                    config('agents_v2_composio.toolkits.'.substr($c->provider, 9).'.name', $c->provider)),
                'accountLabel' => $c->external_identity,
                'email' => filter_var($c->external_identity, FILTER_VALIDATE_EMAIL) ? $c->external_identity : null,
                'scopes' => $c->scopes ?? $this->requested($c->provider), 'scopesSource' => $c->scopes ? 'granted' : 'requested',
                'teammates' => collect($teammates[$c->id] ?? [])->map(fn ($g) => ['agentId' => $g->agent_id, 'name' => $g->name,
                    'operations' => json_decode($g->operations, true) ?: [], 'revision' => (int) $g->revision])->values()->all(),
                'lastUsedAt' => isset($used[$c->id]) ? \Illuminate\Support\Carbon::parse($used[$c->id])->toIso8601String() : null,
                'reconnect' => in_array($status, ['reconnect_required', 'insufficient_scope'], true) ? $this->reconnect($c, $server) : null,
                'local' => $server?->kind === 'local' ? ['hostId' => $server->host_id, 'localId' => $server->local_id] : null,
                'mcp' => $server ? ['kind' => $server->kind, 'serverId' => $server->id, 'url' => $server->kind === 'local' ? '' : $server->url, 'status' => $server->status,
                    'protocolVersion' => $server->protocol_version, 'toolRevision' => $server->tool_revision,
                    'pendingRevision' => $server->pending_revision] : null];
        }, $rows);
    }

    private function status(Connection $c, bool $ready): string
    {
        if (!$ready) return 'unconfigured';
        if ($c->health === 'needs_review') return 'needs_review';
        if ($c->health !== 'healthy') return 'reconnect_required';
        $issue = json_decode((string) $c->scope_issue, true);
        return is_array($issue) && (int) ($issue['generation'] ?? 0) === (int) $c->generation ? 'insufficient_scope' : 'ok';
    }

    /** What the sign-in asked for, when the provider did not report what it granted. */
    private function requested(string $provider): array
    {
        $oauth = (array) config('chat_connectors.catalogue.'.$provider.'.oauth', []);
        $scope = (string) ($oauth['agent_scope'] ?? $oauth['scope'] ?? '');
        return array_values(array_filter(preg_split('/[\s,]+/', $scope)));
    }

    private function reconnect(Connection $c, ?McpServer $server): array
    {
        $path = match (true) {
            $server !== null && $server->kind === 'remote' => '/api/agents/v2/mcp/servers/'.$c->id.'/signin',
            str_starts_with($c->provider, 'composio_') => '/api/agents/v2/composio/'.substr($c->provider, 9).'/start',
            default => '/api/agents/v2/connections/'.$c->provider.'/start',
        };
        return ['method' => 'POST', 'path' => $path];
    }
}
