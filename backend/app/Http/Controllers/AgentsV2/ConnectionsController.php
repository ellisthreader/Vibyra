<?php

namespace App\Http\Controllers\AgentsV2;

use App\Http\Controllers\Controller;
use App\Models\AgentV2\Grant;
use App\Services\AgentRuns\Connections\{Connections, Disconnect, Hub};
use App\Services\AgentRuns\Grants;
use Illuminate\Http\Request;

/** The connections hub (many accounts per provider, status, holders) and per-teammate revisioned grants. */
final class ConnectionsController extends Controller
{
    use V2Requests;

    public function index(Request $request, Hub $hub)
    {
        return $this->json(['connections' => $hub->list($this->v2User($request)->id)]);
    }

    /** Disconnect: revoke every grant on it and drop the stored credential. */
    public function destroy(Request $request, string $id, Disconnect $disconnect)
    {
        $disconnect->remove($this->v2User($request)->id, $id);
        return $this->json(['ok' => true]);
    }

    public function grants(Request $request, string $agentId, Grants $grants)
    {
        $user = $this->v2User($request);
        $grants->agent($user->id, $agentId);
        return $this->json(['grants' => array_map(fn (Grant $g) => $grants->payload($g), $grants->active($user->id, $agentId))]);
    }

    public function put(Request $request, string $agentId, string $connectionId, Grants $grants, Connections $connections)
    {
        $user = $this->v2User($request);
        $data = $request->validate(['operations' => 'required|array|min:1|max:20', 'operations.*' => 'string|max:80']);
        $grant = $grants->put($user->id, $agentId, $connections->find($user->id, $connectionId), $data['operations']);
        return $this->json(['grant' => $grants->payload($grant)]);
    }

    public function revoke(Request $request, string $agentId, string $connectionId, Grants $grants)
    {
        $user = $this->v2User($request);
        $grants->agent($user->id, $agentId);
        $grants->revoke($user->id, $agentId, $connectionId);
        return $this->json(['ok' => true]);
    }
}
