<?php

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use App\Services\Platform\Mcp\Server;
use App\Services\Platform\Mcp\Envelope;
use Illuminate\Http\Request;

/** `POST /api/platform/mcp`: Streamable HTTP, JSON answers only. The API key was checked by AuthenticateApiKey. */
final class PlatformMcpController extends Controller
{
    public function handle(Request $request, Server $server)
    {
        if (!config('platform.mcp_server')) return response()->json(['ok' => false, 'code' => 'not_available', 'error' => 'The MCP server is not switched on.'], 404);
        $raw = $request->getContent();
        $body = strlen($raw) <= 65536 ? json_decode($raw, true) : null;
        if (!is_array($body) || $body === []) return $this->reply($server->error(null, -32700, 'Send one JSON-RPC message.'), 400);
        if (array_is_list($body)) return $this->reply($server->error(null, -32600, 'Send one JSON-RPC message, not a batch.'), 400);
        $wire = Envelope::read($request, $body, $server);
        if ($wire['error']) return $this->reply($wire['error'], 400, $wire['version']);
        $reply = $server->handle($request->user(), $request->attributes->get('apiKey'), $body, $wire['modern']);
        if ($reply === null) return response('', 202);
        return $this->reply($reply, 200, $wire['version']);
    }

    /** Stateless: no GET stream and no session to end. */
    public function refuse()
    {
        return response('', 405)->header('Allow', 'POST');
    }

    private function reply(array $payload, int $status = 200, string $version = Server::VERSIONS[1])
    {
        return response()->json($payload, $status)->header('MCP-Protocol-Version', $version);
    }
}
