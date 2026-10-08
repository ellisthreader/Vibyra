<?php
namespace App\Http\Controllers\AgentsV2;

use App\Http\Controllers\Controller;
use App\Services\AgentWork\{FollowUps, FollowUpSources};
use Illuminate\Http\Request;

final class FollowUpsController extends Controller
{
    use V2Requests;
    public function index(Request $request, FollowUps $followups)
    {
        $user = $this->v2User($request); $data = $request->validate(['agentId' => 'sometimes|uuid']);
        return $this->json(['followups' => $followups->list($user->id, $data['agentId'] ?? null)]);
    }
    public function show(Request $request, string $id, FollowUps $followups)
    {
        return $this->json(['followup' => $followups->payload($followups->find($this->v2User($request)->id, $id))]);
    }
    public function sources(Request $request, FollowUpSources $sources)
    {
        $user = $this->v2User($request); $data = $request->validate(['agentId' => 'required|uuid']);
        return $this->json(['sources' => $sources->list($user->id, $data['agentId'])]);
    }
    public function control(Request $request, string $id, FollowUps $followups)
    {
        $user = $this->v2User($request);
        $data = $request->validate(['revision' => 'required|integer|min:1', 'action' => 'required|in:pause,resume,cancel']);
        return $this->json(['followup' => $followups->control($user->id, $id, (int) $data['revision'], $data['action'])]);
    }
}
