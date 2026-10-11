<?php

namespace App\Http\Controllers\AgentsV2;

use App\Http\Controllers\Controller;
use App\Services\AgentRuns\{ApiError, Rules\Rules};
use Illuminate\Http\Request;

final class RulesController extends Controller
{
    use V2Requests;

    public function index(Request $request, string $agentId, Rules $rules)
    {
        $this->enabled();
        return $this->json($rules->overview($this->v2User($request)->id, $agentId));
    }

    public function save(Request $request, string $agentId, Rules $rules)
    {
        $this->enabled();
        $user = $this->v2User($request);
        $data = $request->validate(['tool' => 'required|string|max:80', 'connectionId' => 'required|uuid',
            'scope' => 'nullable|string|max:200', 'effect' => 'required|in:allow,ask',
            'expectedRevision' => 'required|integer|min:0', 'maxUses' => 'sometimes|integer|min:1|max:100',
            'expiresInDays' => 'nullable|integer|min:1|max:'.config('agent_depth.rule_max_days')]);
        $data['expectedRevision'] = (int) $data['expectedRevision'];
        return $this->json(['rule' => $rules->payload($rules->save($user->id, $agentId, $data))]);
    }

    public function revoke(Request $request, string $agentId, string $ruleId, Rules $rules)
    {
        $this->enabled();
        $rules->revoke($this->v2User($request)->id, $agentId, $ruleId);
        return $this->json(['ok' => true]);
    }

    public function status(Request $request, Rules $rules)
    {
        $user = $this->v2User($request);
        return $this->json(['enabled' => Rules::enabled(), 'paused' => Rules::enabled() && $rules->paused($user->id)]);
    }

    public function pause(Request $request, Rules $rules)
    {
        $this->enabled();
        $data = $request->validate(['paused' => 'required|boolean']);
        $rules->pause($this->v2User($request)->id, (bool) $data['paused']);
        return $this->json(['enabled' => true, 'paused' => (bool) $data['paused']]);
    }

    private function enabled(): void
    {
        if (!Rules::enabled()) ApiError::throw(404, 'not_available', 'Standing rules are not available yet.');
    }
}
