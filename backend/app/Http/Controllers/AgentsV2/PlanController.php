<?php

namespace App\Http\Controllers\AgentsV2;

use App\Http\Controllers\Controller;
use App\Services\AgentRuns\{ApiError, Templates};
use App\Services\AgentRuns\Planning\TaskPlan;
use App\Services\Membership\PlanLimits;
use Illuminate\Http\Request;

/** Phase 8: the task plan preview (no admission, no model call) and starter teammates. */
final class PlanController extends Controller
{
    use V2Requests, AdmissionInput;

    public function preview(Request $request, TaskPlan $plan)
    {
        $user = $this->v2User($request);
        return $this->json(['plan' => $plan->preview($user->id, $this->admissionInput($request, $user->id))]);
    }

    public function templates(Request $request, Templates $templates)
    {
        return $this->json(['templates' => $templates->list($this->v2User($request)->id)]);
    }

    public function fromTemplate(Request $request, string $key, Templates $templates)
    {
        $user = $this->v2User($request);
        if (!app(PlanLimits::class)->allows($user, 'agents'))
            ApiError::throw(402, 'plan_required', \App\Http\Controllers\AgentsController::AGENTS_NEED_PRO);
        $data = $request->validate(['id' => 'required|uuid', 'name' => 'sometimes|nullable|string|max:80']);
        $template = $templates->payload($key);
        app(\App\Services\Vibes\Wallet::class)->ensure($user); // v1 profile saves lock this row; v2 never spends it.
        return $this->json(['teammate' => $templates->create($user->id, $key, $data['id'], $data['name'] ?? null),
            'template' => $template], 201);
    }
}
