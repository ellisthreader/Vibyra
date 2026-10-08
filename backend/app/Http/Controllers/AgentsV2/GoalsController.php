<?php
namespace App\Http\Controllers\AgentsV2;

use App\Http\Controllers\Controller;
use App\Services\AgentWork\Goals;
use Illuminate\Http\Request;

final class GoalsController extends Controller
{
    use V2Requests;
    public function index(Request $request, Goals $goals)
    {
        $user = $this->v2User($request); $data = $request->validate(['agentId' => 'sometimes|uuid']);
        return $this->json(['goals' => $goals->list($user->id, $data['agentId'] ?? null)]);
    }
    public function show(Request $request, string $id, Goals $goals)
    {
        return $this->json(['goal' => $goals->payload($goals->find($this->v2User($request)->id, $id))]);
    }
    public function control(Request $request, string $id, Goals $goals)
    {
        $user = $this->v2User($request);
        $data = $request->validate(['revision' => 'required|integer|min:1', 'action' => 'required|in:pause,resume,cancel']);
        return $this->json(['goal' => $goals->control($user->id, $id, (int) $data['revision'], $data['action'])]);
    }
    public function confirm(Request $request, string $id, Goals $goals)
    {
        $user = $this->v2User($request); $data = $request->validate(['revision' => 'required|integer|min:1']);
        return $this->json(['goal' => $goals->confirm($user->id, $id, (int) $data['revision'])]);
    }
}
