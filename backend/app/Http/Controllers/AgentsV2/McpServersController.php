<?php

namespace App\Http\Controllers\AgentsV2;

use App\Http\Controllers\Controller;
use App\Models\AgentV2\McpServer;
use App\Services\AgentRuns\ApiError;
use App\Services\AgentRuns\Connections\Connections;
use App\Services\AgentRuns\LocalMcp\LocalMcpTools;
use App\Services\AgentRuns\Mcp\{McpError, McpOAuth, McpPayload, McpServers, McpTools};
use App\Services\ChatConnectors\OAuthFlows;
use Illuminate\Http\Request;

/**
 * Remote MCP servers as teammate connections: add by URL (sign in when the server
 * asks), inspect the pinned tools, re-check them, approve a changed list, and mark
 * read-only-annotated tools as reads. `{id}` is the server's connection id.
 */
final class McpServersController extends Controller
{
    use V2Requests, CallbackPage;

    public function store(Request $request, McpServers $servers, Connections $connections)
    {
        $user = $this->v2User($request);
        $data = $request->validate(['url' => 'required|string|max:2048', 'name' => 'nullable|string|max:80',
            'returnUrl' => 'nullable|string|max:500']);
        $added = $servers->add($user->id, $data['url'], $data['name'] ?? null, $data['returnUrl'] ?? null);
        return $this->json(['connection' => $connections->payload($added['connection']), 'server' => $this->payload($added['server']),
            'signIn' => $added['signIn']], 201);
    }

    public function show(Request $request, string $id)
    {
        return $this->json(['server' => $this->payload($this->server($request, $id))]);
    }

    public function signin(Request $request, string $id, McpServers $servers)
    {
        $data = $request->validate(['returnUrl' => 'nullable|string|max:500']);
        return $this->json($servers->signIn($this->v2User($request)->id, $this->server($request, $id, true), $data['returnUrl'] ?? null));
    }

    /** Compare the live tool list with the pinned one now (tool calls also do this every time). */
    public function refresh(Request $request, string $id, McpServers $servers, Connections $connections)
    {
        $server = $this->server($request, $id, true);
        try { $server = $servers->sync($server, $connections->find($server->user_id, $id)); }
        catch (\App\Services\ChatConnectors\ReconnectRequired) { ApiError::throw(409, 'reconnect_required', 'Sign in to this server again.'); }
        catch (McpError $e) { ApiError::throw($e->reason === 'unauthorized' ? 409 : 422,
            $e->reason === 'unauthorized' ? 'reconnect_required' : 'mcp_unavailable', $e->getMessage()); }
        return $this->json(['server' => $this->payload($server)]);
    }

    public function approve(Request $request, string $id, McpServers $servers)
    {
        $data = $request->validate(['revision' => 'required|string|size:64']);
        return $this->json(['server' => $this->payload($servers->approve($this->server($request, $id), $data['revision']))]);
    }

    public function reads(Request $request, string $id, McpServers $servers)
    {
        $data = $request->validate(['tools' => 'present|array|max:100', 'tools.*' => 'string|max:80']);
        return $this->json(['server' => $this->payload($servers->markReads($this->server($request, $id), $data['tools']))]);
    }

    /** Public: the server's authorization server sends the browser here. */
    public function callback(Request $request, McpOAuth $oauth)
    {
        $flow = $oauth->finish((string) $request->query('state', ''), (string) $request->query('code', ''), (string) $request->query('error', ''), OAuthFlows::presented($request));
        return $this->finished($flow, 'The MCP server');
    }

    /** Public: the Client ID Metadata Document for servers that accept a URL as client_id. */
    public function clientMetadata()
    {
        return response()->json(McpOAuth::metadata())->header('Cache-Control', 'public, max-age=3600');
    }

    /** Show, review and reads work for a local server too (the hub treats it as an MCP server); only a remote one can be signed in to or re-fetched here. */
    private function server(Request $request, string $id, bool $remoteOnly = false): McpServer
    {
        $user = $this->v2User($request);
        $server = McpServer::query()->where('user_id', $user->id)->where('connection_id', $id)->where('status', '!=', 'removed')->first();
        if (!$server) ApiError::throw(404, 'connection_not_found', 'That MCP server does not exist.');
        if ($remoteOnly && $server->kind === 'local') ApiError::throw(409, 'local_server', 'This server runs on your Mac. Check it for changes there.');
        return $server;
    }

    private function payload(McpServer $s): array
    {
        $local = $s->kind === 'local';
        $adapter = $local ? new LocalMcpTools($s) : new McpTools($s);
        return ['kind' => $s->kind, 'localId' => $local ? $s->local_id : null, 'hostId' => $local ? $s->host_id : null,
            'connectionId' => $s->connection_id, 'serverId' => $s->id, 'provider' => $s->slug, 'url' => $local ? '' : $s->url, 'name' => $s->name,
            'auth' => $s->auth, 'status' => $s->status, 'protocolVersion' => $s->protocol_version, 'toolRevision' => $s->tool_revision,
            'tools' => McpPayload::tools($s, $adapter), 'pending' => McpPayload::pending($s, $adapter)];
    }
}
