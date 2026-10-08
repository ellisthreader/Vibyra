<?php

namespace App\Http\Controllers\AgentsV2;

use App\Http\Controllers\Controller;
use App\Services\AgentRuns\RuntimeBindings;
use Illuminate\Http\Request;

/** The Mac registers its selected AI account; the runner key is returned once. */
final class RuntimesController extends Controller
{
    use V2Requests;

    public function store(Request $request, RuntimeBindings $bindings)
    {
        $user = $this->v2User($request);
        $data = $request->validate(['hostId' => ['required', 'regex:/^[a-f0-9]{64}$/D'],
            'provider' => ['required', 'regex:/^[a-z0-9_-]{2,40}$/D'], 'accountRef' => 'required|string|min:1|max:128',
            'model' => 'required|string|min:1|max:120', 'effort' => 'sometimes|nullable|in:minimal,low,medium,high,xhigh,max',
            'providerVersion' => 'sometimes|nullable|string|max:60', 'capabilities' => 'required|array|max:20',
            'capabilities.controlledTools' => 'required|boolean', 'capabilities.pinnedSkillsV1' => 'sometimes|boolean',
            // Phase 4: the Mac can run computer tools (claim + receipt endpoints).
            'capabilities.computerTools' => 'sometimes|boolean',
            // Phase 7: the Mac can run browser tools in a separate profile (claim + receipt endpoints).
            'capabilities.browserTools' => 'sometimes|boolean',
            'capabilities.taskSteering' => 'sometimes|boolean',
            // Roadmap Part 6: the Mac runs local MCP servers (claim + receipt endpoints).
            'capabilities.localMcp' => 'sometimes|boolean']);
        return $this->json(['runtime' => $bindings->register($user->id, $data)], 201);
    }

    public function index(Request $request, RuntimeBindings $bindings)
    {
        $user = $this->v2User($request);
        return $this->json(['runtimes' => array_map(fn ($b) => $bindings->payload($b), $bindings->list($user->id))]);
    }

    public function destroy(Request $request, string $id, RuntimeBindings $bindings)
    {
        $bindings->revoke($this->v2User($request)->id, $id);
        return $this->json(['ok' => true]);
    }
}
