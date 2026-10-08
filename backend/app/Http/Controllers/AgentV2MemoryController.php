<?php

namespace App\Http\Controllers;

use App\Http\Controllers\AgentsV2\V2Requests;
use App\Services\AgentRuns\Memory\{Memories, Scope};
use App\Services\AgentRuns\RuntimeBindings;
use Illuminate\Http\Request;

final class AgentV2MemoryController extends Controller
{
    use V2Requests;

    public function index(Request $request, string $id)
    {
        [$user, $binding, $scope] = $this->context($request, $id);
        $memories = Scope::query($user, $id, $scope)->where('status', '!=', 'forgotten')
            ->orderByDesc('updated_at')->limit(200)->get()->map(fn ($m) => Scope::payload($m))->all();
        return $this->json(['runtimeId' => $binding->id, 'accountScope' => $scope, 'accountLabel' => $binding->provider.' · '.$binding->account_ref, 'memories' => $memories]);
    }

    public function store(Request $request, string $id, Memories $memories)
    {
        [$user, $binding, $scope] = $this->context($request, $id);
        $data = $request->validate(['fact' => 'required|string|max:1000', 'key' => 'sometimes|string|max:100',
            'sourceKind' => 'sometimes|in:user,document', 'expiresAt' => 'sometimes|nullable|date|after:now']);
        return $this->json(['memory' => $memories->put($user, $id, $scope, $data)], 201);
    }

    public function update(Request $request, string $id, string $memoryId, Memories $memories)
    {
        [$user, $binding, $scope] = $this->context($request, $id);
        $data = $request->validate(['revision' => 'required|integer|min:1', 'action' => 'required|in:accept,undo,correct,forget',
            'fact' => 'required_if:action,correct|string|max:1000']);
        return $this->json(['memory' => $memories->change($user, $id, $scope, $memoryId, $data)]);
    }

    private function context(Request $request, string $agent): array
    {
        $user = $this->v2User($request)->id;
        $write = !$request->isMethod('GET');
        $data = $request->validate(['runtimeId' => $write ? 'required|uuid' : 'sometimes|nullable|uuid',
            'accountScope' => $write ? 'required|string|size:64' : 'sometimes|string|size:64']);
        $binding = Scope::resolve($user, $agent, $data['runtimeId'] ?? null);
        $scope = Scope::hash(RuntimeBindings::snapshot($binding));
        if ($write && !hash_equals($scope, $data['accountScope']))
            \App\Services\AgentRuns\ApiError::throw(409, 'memory_account_changed', 'The selected AI account changed. Reload memory first.');
        return [$user, $binding, $scope];
    }
}
