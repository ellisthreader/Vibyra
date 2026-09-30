<?php

namespace App\Http\Controllers\AgentsV2;

use App\Http\Controllers\Controller;
use App\Models\AgentV2\Connection;
use App\Services\AgentRuns\ApiError;
use App\Services\AgentRuns\Connections\Connections;
use App\Services\AgentRuns\Tools\Providers\Adapters;
use App\Services\ChatConnectors\ConnectorOAuth;
use Illuminate\Http\Request;

/**
 * "Add another account": a sign-in (or pasted token) that stores an extra
 * `agent_connections` row for a provider, leaving the ordinary-chat install as it
 * is. The provider redirect is the existing `/api/connectors/callback/{slug}`.
 */
final class ConnectionFlowsController extends Controller
{
    use V2Requests;

    public function start(Request $request, string $provider, ConnectorOAuth $oauth)
    {
        $user = $this->v2User($request);
        $this->available($provider);
        if (!$oauth->configured($provider)) ApiError::throw(409, 'oauth_unavailable', 'Sign-in for this service is not set up yet.');
        $data = $request->validate(['returnUrl' => 'nullable|string|max:500']);
        return $this->json($oauth->start($user->id, $provider, $data['returnUrl'] ?? null, 'add_account'));
    }

    /** How the sign-in ended; `connected` carries the connection it created or refreshed. */
    public function flow(Request $request, string $flow, ConnectorOAuth $oauth, Connections $connections)
    {
        $user = $this->v2User($request);
        $status = $oauth->status($flow, $user->id);
        $id = $status['connectionId'] ?? null;
        $row = is_string($id) ? Connection::query()->where('user_id', $user->id)->whereKey($id)->first() : null;
        return $this->json(['status' => $status['status'], 'error' => $status['error'] ?? null,
            'connection' => $row ? $connections->payload($row) : null]);
    }

    /** A pasted token (e.g. a GitHub fine-grained token) for another account. */
    public function store(Request $request, Connections $connections)
    {
        $user = $this->v2User($request);
        $data = $request->validate(['provider' => 'required|string|max:40', 'credential' => 'required|string|max:1000']);
        $this->available($data['provider']);
        $row = $connections->addAccount($user->id, $data['provider'], trim($data['credential']));
        return $this->json(['connection' => $connections->payload($row)], 201);
    }

    private function available(string $provider): void
    {
        if (!app(Adapters::class)->has($provider)) ApiError::throw(404, 'unknown_provider', 'That integration is not available to teammates.');
        if (!config('chat_connectors.enabled')) ApiError::throw(503, 'integrations_disabled', 'Integrations are switched off right now.');
    }
}
