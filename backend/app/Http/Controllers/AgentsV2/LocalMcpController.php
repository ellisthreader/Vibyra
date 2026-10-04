<?php

namespace App\Http\Controllers\AgentsV2;

use App\Http\Controllers\Controller;
use App\Services\AgentRuns\ApiError;
use App\Services\AgentRuns\Connections\Disconnect;
use App\Services\AgentRuns\LocalMcp\{LocalMcpActions, LocalMcpReceipts, LocalMcpServers};
use App\Services\AgentRuns\Mcp\McpServers;
use Illuminate\Http\Request;

/**
 * Roadmap Part 6: local (stdio) MCP servers. Client routes: the Mac registers a server's catalogue (an opaque id,
 * a name and tools; never its command line or environment), approves a changed list and marks reads; every client
 * can list them. Runner routes: the leased Mac lists, claims and answers approved calls, fenced by generation.
 * `{id}` is the server's connection id. Contract: docs/agent-v2-api-contract.md §6g.
 */
final class LocalMcpController extends Controller
{
    use V2Requests;

    public function index(Request $request, LocalMcpServers $servers)
    {
        $user = $this->v2User($request);
        $host = $request->query('hostId');
        $list = LocalMcpServers::enabled() ? $servers->list($user->id, is_string($host) && preg_match('/^[a-f0-9]{64}$/D', $host) ? $host : null) : [];
        return $this->json(['enabled' => LocalMcpServers::enabled(), 'servers' => array_map($servers->payload(...), $list)]);
    }

    public function store(Request $request, LocalMcpServers $servers)
    {
        $user = $this->v2User($request);
        abort_if(max((int) $request->header('Content-Length', 0), strlen($request->getContent())) > (int) config('agents_v2_local_mcp.max_catalogue_bytes'), 413,
            'The tool catalogue is too large.');
        $data = $request->validate(['hostId' => ['required', 'regex:/^[a-f0-9]{64}$/D'], 'localId' => ['required', 'regex:/^[A-Za-z0-9-]{8,64}$/D'],
            'name' => 'required|string|min:1|max:80', 'tools' => 'present|array|max:200', 'tools.*' => 'array']);
        $server = $servers->register($user->id, $data['hostId'], $data['localId'], $data['name'], $data['tools']);
        return $this->json(['server' => $servers->payload($server)], $server->wasRecentlyCreated ? 201 : 200);
    }

    public function show(Request $request, string $id, LocalMcpServers $servers)
    {
        return $this->json(['server' => $servers->payload($servers->find($this->v2User($request)->id, $id))]);
    }

    public function approve(Request $request, string $id, LocalMcpServers $servers, McpServers $mcp)
    {
        $data = $request->validate(['revision' => 'required|string|size:64']);
        $server = $servers->find($this->v2User($request)->id, $id);
        return $this->json(['server' => $servers->payload($mcp->approve($server, $data['revision']))]);
    }

    public function reads(Request $request, string $id, LocalMcpServers $servers, McpServers $mcp)
    {
        $data = $request->validate(['tools' => 'present|array|max:100', 'tools.*' => 'string|max:80']);
        $server = $servers->find($this->v2User($request)->id, $id);
        return $this->json(['server' => $servers->payload($mcp->markReads($server, $data['tools']))]);
    }

    public function destroy(Request $request, string $id, LocalMcpServers $servers, Disconnect $disconnect)
    {
        $user = $this->v2User($request);
        $server = $servers->find($user->id, $id);
        $disconnect->remove($user->id, $server->connection_id);
        return $this->json(['ok' => true]);
    }

    public function actions(Request $request, string $runtime, string $run, LocalMcpActions $actions)
    {
        $binding = $this->runner($request, $runtime);
        return $this->json(['actions' => $actions->pending($binding, $run, $this->generation($request))]);
    }

    public function claim(Request $request, string $runtime, string $run, string $action, LocalMcpActions $actions)
    {
        $binding = $this->runner($request, $runtime);
        abort_if(max((int) $request->header('Content-Length', 0), strlen($request->getContent())) > (int) config('agents_v2_local_mcp.max_catalogue_bytes'), 413,
            'The tool catalogue is too large.');
        $data = $request->validate(['generation' => 'required|integer|min:1', 'fingerprint' => ['required', 'regex:/^[a-f0-9]{64}$/D'],
            'tools' => 'sometimes|array|max:200', 'tools.*' => 'array', 'unavailable' => 'sometimes|array',
            'unavailable.reason' => ['required_with:unavailable', 'in:'.implode(',', LocalMcpReceipts::REASONS)],
            'unavailable.error' => 'required_with:unavailable|string|max:300']);
        return $this->json(['action' => $actions->claim($binding, $run, $action, (int) $data['generation'], $data['fingerprint'],
            $data['tools'] ?? null, $data['unavailable'] ?? null)]);
    }

    public function receipt(Request $request, string $runtime, string $run, string $action, LocalMcpActions $actions)
    {
        $binding = $this->runner($request, $runtime);
        // The body itself is measured too: a chunked request carries no Content-Length header (F-28).
        abort_if(max((int) $request->header('Content-Length', 0), strlen($request->getContent())) > (int) config('agents_v2_local_mcp.max_receipt_bytes'), 413,
            'The receipt exceeds its bound.');
        $data = $request->validate(['generation' => 'required|integer|min:1', 'result' => 'required|array']);
        return $this->json(['action' => $actions->receipt($binding, $run, $action, (int) $data['generation'], $request->input('result'))]);
    }

    private function generation(Request $request): int
    {
        $value = $request->input('generation', $request->query('generation'));
        if (!is_numeric($value) || (int) $value < 1) ApiError::throw(422, 'generation_required', 'Send the lease generation.');
        return (int) $value;
    }
}
