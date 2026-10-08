<?php

namespace App\Http\Controllers\AgentsV2;

use App\Http\Controllers\Controller;
use App\Services\AgentRuns\Composio\ComposioAccounts;
use App\Services\AgentRuns\Connections\Readiness;
use App\Services\AgentRuns\Mcp\McpPresets;
use App\Services\ChatConnectors\OAuthFlows;
use Illuminate\Http\Request;

/** The teammate integration catalogue (honest readiness, plus one-tap MCP presets) and Composio account linking. */
final class IntegrationsController extends Controller
{
    use V2Requests, CallbackPage;

    public function catalogue(Request $request, Readiness $readiness)
    {
        $this->v2User($request);
        return $this->json(['providers' => $readiness->catalogue(), 'mcpPresets' => McpPresets::available()]);
    }

    public function composioStart(Request $request, string $toolkit, ComposioAccounts $accounts)
    {
        $user = $this->v2User($request);
        $data = $request->validate(['returnUrl' => 'nullable|string|max:500']);
        return $this->json($accounts->start($user->id, $toolkit, $data['returnUrl'] ?? null));
    }

    /** Public: Composio returns the browser here after the person linked their own account. */
    public function composioCallback(Request $request, ComposioAccounts $accounts)
    {
        $flow = $accounts->finish((string) $request->query('state', ''), (string) $request->query('status', ''), OAuthFlows::presented($request));
        return $this->finished($flow, 'The service');
    }
}
