<?php

namespace App\Services\AgentRuns\Mcp;

use App\Models\AgentV2\Connection;
use App\Models\AgentV2\Grant;
use App\Models\AgentV2\McpServer;
use App\Services\AgentRuns\ApiError;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Adding a remote MCP server, pinning its reviewed tool list, and re-review when
 * the server's tools change. A changed list moves the connection to `needs_review`
 * (no tools in any manifest) until the person approves the new revision; grants
 * then keep only tools whose reviewed definition did not change.
 */
final class McpServers
{
    public function __construct(private readonly SafeHttp $http, private readonly Protocol $protocol,
        private readonly ToolList $list, private readonly McpOAuth $oauth, private readonly McpTokens $tokens) {}

    /** @return array{server: McpServer, connection: Connection, signIn: ?array} */
    public function add(int $userId, string $url, ?string $name, ?string $returnUrl): array
    {
        if (!config('chat_connectors.enabled') || !config('agents_v2_mcp.enabled'))
            ApiError::throw(409, 'provider_unavailable', 'Remote MCP servers are not switched on yet.');
        // Check exactly what was typed (credentials, ports and schemes included) before normalising it.
        try { $this->http->check($url); $url = Discovery::canonical($url); $this->http->check($url); }
        catch (McpError $e) { ApiError::throw(422, 'blocked_destination', 'Use a public HTTPS MCP address.'); }
        [$server, $row] = DB::transaction(function () use ($userId, $url, $name) {
            // The cap is a count, so parallel adds each passed it (six at nine of ten left fifteen servers). Count under the user row lock.
            DB::table('users')->where('id', $userId)->lockForUpdate()->first();
            $count = McpServer::query()->where('user_id', $userId)->where('kind', 'remote')->whereIn('connection_id', Connection::query()->select('id')
                ->where('user_id', $userId)->whereNull('revoked_at'))->count();
            if ($count >= (int) config('agents_v2_mcp.max_servers', 10)) ApiError::throw(409, 'limit_reached', 'Remove a server before adding another.');
            $slug = 'mcp_'.bin2hex(random_bytes(4));
            $row = Connection::query()->create(['user_id' => $userId, 'provider' => $slug, 'external_identity' => mb_substr(
                (string) parse_url($url, PHP_URL_HOST), 0, 255), 'health' => 'reconnect_required', 'generation' => 1, 'capability_revision' => 1]);
            $server = McpServer::query()->create(['user_id' => $userId, 'connection_id' => $row->id, 'slug' => $slug, 'url' => $url,
                'name' => mb_substr(trim((string) $name) ?: (string) parse_url($url, PHP_URL_HOST), 0, 80), 'status' => 'pending_auth']);
            return [$server, $row];
        });
        try {
            $session = $this->protocol->open($url, null);
            $this->protocol->close($session);
            $row->forceFill(['credential' => Crypt::encryptString('')])->save();
            $added = ['server' => $this->sync($server, $row), 'connection' => $row->fresh(), 'signIn' => null];
            \App\Services\Platform\AccountActivity::record($userId, 'mcp_server.added', ['name' => $server->name, 'kind' => 'remote']);
            return $added;
        } catch (McpError $e) {
            if ($e->reason === 'unauthorized') {
                \App\Services\Platform\AccountActivity::record($userId, 'mcp_server.added', ['name' => $server->name, 'kind' => 'remote']);
                try { return ['server' => $server, 'connection' => $row, 'signIn' => $this->oauth->start($userId, $server, (string) $e->challenge, $returnUrl)]; }
                catch (McpError $oauth) { $e = $oauth; }
            }
            DB::transaction(fn () => [$server->delete(), $row->forceFill(['revoked_at' => now(), 'health' => 'revoked'])->save()]);
            ApiError::throw(422, $e->reason === 'blocked_destination' ? 'blocked_destination' : 'mcp_unavailable', $e->getMessage());
        }
    }

    /** Sign in again (reconnect) to a server that needs it. */
    public function signIn(int $userId, McpServer $server, ?string $returnUrl): array
    {
        try {
            $this->protocol->close($this->protocol->open($server->url, null));
            ApiError::throw(409, 'no_sign_in', 'This MCP server does not ask for a sign-in.');
        } catch (McpError $e) {
            if ($e->reason !== 'unauthorized' && $e->reason !== 'insufficient_scope') ApiError::throw(422, 'mcp_unavailable', $e->getMessage());
            try { return $this->oauth->start($userId, $server, (string) $e->challenge, $returnUrl); }
            catch (McpError $oauth) { ApiError::throw(422, 'mcp_unavailable', $oauth->getMessage()); }
        }
    }

    /** Fetch the live tool list: pin it the first time, or hold a changed list for review. */
    public function sync(McpServer $server, Connection $row): McpServer
    {
        $token = $server->auth === 'oauth' ? $this->tokens->credential($row) : null;
        $session = $this->protocol->open($server->url, $token);
        try { $live = $this->list->fetch($session, $server->slug); } finally { $this->protocol->close($session); }
        $this->observe($server, $row, $live, $session['version']);
        return $server->fresh();
    }

    /** Record what the server offers now; a different revision than the pinned one needs review. */
    public function observe(McpServer $server, Connection $row, array $live, ?string $version = null): bool
    {
        $changed = $server->tool_revision !== null && $server->tool_revision !== $live['revision'];
        $server->forceFill(array_filter(['protocol_version' => $version], fn ($v) => $v !== null) + ($server->tool_revision === null
            ? ['tools' => $live['tools'], 'tool_revision' => $live['revision'], 'status' => 'active']
            : ($changed ? ['pending_tools' => $live['tools'], 'pending_revision' => $live['revision'], 'status' => 'tools_changed']
                : ['pending_tools' => null, 'pending_revision' => null, 'status' => 'active'])))->save();
        $row->forceFill(['health' => $changed ? 'needs_review' : 'healthy'])->save();
        return $changed;
    }

    /** Accept the pending tool list. Grants keep only tools whose reviewed definition is unchanged. */
    public function approve(McpServer $server, string $revision): McpServer
    {
        if (!$server->pending_revision) ApiError::throw(409, 'nothing_to_review', 'This server has no tool changes to review.');
        if ($server->pending_revision !== $revision) ApiError::throw(409, 'stale_revision', 'The tool list changed again. Review it once more.');
        $old = collect($server->tools ?? [])->mapWithKeys(fn ($t) => [$t['tool'] => ToolList::toolHash($t)]);
        $same = collect($server->pending_tools)->filter(fn ($t) => ($old[$t['tool']] ?? null) === ToolList::toolHash($t))->pluck('tool')->all();
        DB::transaction(function () use ($server, $same) {
            foreach (Grant::query()->where('connection_id', $server->connection_id)->whereNull('revoked_at')->lockForUpdate()->get() as $g) {
                $ops = array_values(array_intersect($g->operations ?? [], $same));
                $g->forceFill($ops === [] ? ['revoked_at' => now(), 'revision' => $g->revision + 1]
                    : ['operations' => $ops, 'revision' => $g->revision + ($ops === $g->operations ? 0 : 1)])->save();
            }
            $server->forceFill(['tools' => $server->pending_tools, 'tool_revision' => $server->pending_revision, 'pending_tools' => null,
                'pending_revision' => null, 'status' => 'active', 'read_tools' => array_values(array_intersect($server->read_tools ?? [], $same))])->save();
            Connection::query()->whereKey($server->connection_id)->update(['health' => 'healthy',
                'capability_revision' => DB::raw('capability_revision + 1'), 'updated_at' => now()]);
        });
        return $server->fresh();
    }

    /** The person marks tools as reads. Only tools the server annotates `readOnlyHint` can be; others always need approval. */
    public function markReads(McpServer $server, array $tools): McpServer
    {
        $hinted = collect($server->tools ?? [])->where('readOnlyHint', true)->pluck('tool')->all();
        $bad = array_diff($tools, $hinted);
        if ($bad !== []) ApiError::throw(422, 'not_read_only', 'Only tools the server marks read-only can be treated as reads: '
            .Str::limit(implode(', ', $bad), 120));
        DB::transaction(function () use ($server, $tools) {
            $server->forceFill(['read_tools' => array_values(array_unique($tools))])->save();
            // Approval behaviour changed: outstanding approvals on this server must be decided afresh.
            Grant::query()->where('connection_id', $server->connection_id)->whereNull('revoked_at')
                ->update(['revision' => DB::raw('revision + 1'), 'updated_at' => now()]);
        });
        return $server->fresh();
    }
}
