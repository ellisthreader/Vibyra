<?php

namespace App\Http\Controllers\AgentsV2;

use App\Http\Controllers\Controller;
use App\Services\AgentRuns\ApiError;
use App\Services\AgentRuns\Browser\{BrowserActions, BrowserGrants, BrowserAccessVersion};
use Illuminate\Http\Request;

/**
 * Phase 7 browser: a teammate's allowed sites (client routes), and the leased Mac's
 * browser actions (runner routes: list, claim, receipt; fenced by generation).
 */
final class BrowserController extends Controller
{
    use V2Requests;

    public function show(Request $request, string $agentId, BrowserGrants $grants)
    {
        $user = $this->v2User($request);
        return $this->json(['enabled' => (bool) config('agents_v2_browser.enabled'), 'browser' => $grants->show($user->id, $agentId),
            'targets' => \App\Services\AgentRuns\Browser\BrowserRuntimeScope::targets($user->id),
            'revision' => BrowserAccessVersion::revision($user->id, $agentId)]);
    }

    public function put(Request $request, string $agentId, BrowserGrants $grants)
    {
        $user = $this->v2User($request);
        if (!config('agents_v2_browser.enabled')) ApiError::throw(409, 'browser_disabled', 'Browser tools are not available yet.');
        \App\Services\AgentRuns\Jobs\Membership::require($user->id);
        $expected = $this->expected($request);
        $data = $request->validate(['origins' => 'required|array|min:1|max:20', 'origins.*' => 'string|max:300',
            'uploadsAllowed' => 'sometimes|boolean', 'runtimeId' => 'sometimes|nullable|uuid']);
        return $this->json(['browser' => $grants->put($user->id, $agentId, $data['origins'], $expected, array_intersect_key($data, array_flip(['uploadsAllowed', 'runtimeId']))),
            'revision' => BrowserAccessVersion::revision($user->id, $agentId)]);
    }

    public function destroy(Request $request, string $agentId, BrowserGrants $grants)
    {
        $user = $this->v2User($request);
        $grants->revoke($user->id, $agentId, $this->expected($request));
        return $this->json(['browser' => null, 'revision' => BrowserAccessVersion::revision($user->id, $agentId)]);
    }

    public function index(Request $request, string $runtime, string $run, BrowserActions $actions)
    {
        $binding = \App\Services\AgentRuns\Browser\BrowserRuntimeScope::runner($request, $runtime);
        return $this->json(['actions' => $actions->pending($binding, $run, $this->generation($request))]);
    }

    public function claim(Request $request, string $runtime, string $run, string $action, BrowserActions $actions)
    {
        $binding = \App\Services\AgentRuns\Browser\BrowserRuntimeScope::runner($request, $runtime);
        $data = $request->validate(['generation' => 'required|integer|min:1', 'fingerprint' => ['required', 'regex:/^[a-f0-9]{64}$/D']]);
        return $this->json(['action' => $actions->claim($binding, $run, $action, (int) $data['generation'], $data['fingerprint'])]);
    }

    public function receipt(Request $request, string $runtime, string $run, string $action, BrowserActions $actions)
    {
        $binding = \App\Services\AgentRuns\Browser\BrowserRuntimeScope::runner($request, $runtime);
        // The body itself is measured too: a chunked request carries no Content-Length header (F-28).
        abort_if(max((int) $request->header('Content-Length', 0), strlen($request->getContent())) > 64 * 1024, 413, 'The receipt exceeds its bound.');
        $data = $request->validate(['generation' => 'required|integer|min:1', 'result' => 'required|array']);
        return $this->json(['action' => $actions->receipt($binding, $run, $action, (int) $data['generation'], $request->input('result'))]);
    }

    private function expected(Request $request): array
    {
        $data = $request->validate(['expectedRevision' => 'required|integer|min:0',
            'expectedConnectionId' => 'present|nullable|uuid', 'expectedGeneration' => 'required|integer|min:0']);
        return [...$data, 'expectedRevision' => (int) $data['expectedRevision'], 'expectedGeneration' => (int) $data['expectedGeneration']];
    }

    private function generation(Request $request): int
    {
        $value = $request->input('generation', $request->query('generation'));
        if (!is_numeric($value) || (int) $value < 1) ApiError::throw(422, 'generation_required', 'Send the lease generation.');
        return (int) $value;
    }
}
