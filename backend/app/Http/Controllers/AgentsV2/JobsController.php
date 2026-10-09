<?php

namespace App\Http\Controllers\AgentsV2;

use App\Http\Controllers\Controller;
use App\Models\AgentV2\Run;
use App\Services\AgentRuns\{Jobs\Capacity, Runs, RunStates};
use Illuminate\Http\Request;

final class JobsController extends Controller
{
    use V2Requests;

    public function index(Request $request, Runs $runs)
    {
        $user = $this->v2User($request);
        $data = $request->validate(['agentId' => 'required_with:idempotencyKey|uuid',
            'idempotencyKey' => 'sometimes|string|min:1|max:128', 'limit' => 'sometimes|integer|min:1|max:50']);
        $rows = Run::query()->where('user_id', $user->id)->when($data['agentId'] ?? null, fn ($q, $id) => $q->where('agent_id', $id))
            ->when($data['idempotencyKey'] ?? null, fn ($q, $key) => $q->where('idempotency_key', $key))
            ->orderByRaw('CASE WHEN state IN ('.implode(',', array_fill(0, count(RunStates::TERMINAL), '?')).') THEN 1 ELSE 0 END', RunStates::TERMINAL)
            ->orderByDesc('created_at')->orderByDesc('id')->limit($data['limit'] ?? 30)->get();
        return $this->json(['enabled' => (bool) config('agents_v2.parallel_jobs_enabled'),
            'capacity' => Capacity::payload($user->id), 'runs' => $rows->map(fn ($run) => $runs->payload($run))->all()]);
    }
}
