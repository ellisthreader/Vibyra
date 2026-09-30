<?php

namespace App\Http\Controllers\AgentsV2;

use App\Http\Controllers\Controller;
use App\Services\AgentRuns\{Admission, ApiError, Events, Runs};
use App\Services\AgentRuns\Tools\{Approvals, Broker, Manifest};
use App\Services\Membership\PlanLimits;
use Illuminate\Http\Request;

/** Client API (Mac + iPhone): admit, read, replay, cancel, approve. */
final class RunsController extends Controller
{
    use V2Requests, AdmissionInput;

    public function store(Request $request, Admission $admission, Runs $runs)
    {
        $user = $this->v2User($request);
        if (!app(PlanLimits::class)->allows($user, 'agents'))
            ApiError::throw(402, 'plan_required', \App\Http\Controllers\AgentsController::AGENTS_NEED_PRO);
        $data = $this->admissionInput($request, $user->id);
        [$run, $created] = $admission->admit($user->id, $data);
        return $this->json(['run' => $runs->payload($run), 'replayed' => !$created], $created ? 201 : 200);
    }

    public function index(Request $request, Runs $runs)
    {
        $user = $this->v2User($request);
        $data = $request->validate(['agentId' => 'required|uuid', 'limit' => 'sometimes|integer|min:1|max:50']);
        return $this->json(['runs' => array_map(fn ($r) => $runs->payload($r), $runs->list($user->id, $data['agentId'], (int) ($data['limit'] ?? 20)))]);
    }

    public function show(Request $request, string $id, Runs $runs)
    {
        $run = $runs->find($this->v2User($request)->id, $id);
        return $this->conditional($request, Runs::etag($run), fn () => ['run' => $runs->payload($run)]);
    }

    public function events(Request $request, string $id, Runs $runs, Events $events)
    {
        $run = $runs->find($this->v2User($request)->id, $id);
        $data = $request->validate(['after' => 'sometimes|integer|min:0', 'limit' => 'sometimes|integer|min:1|max:200']);
        $after = (int) ($data['after'] ?? 0);
        $limit = (int) ($data['limit'] ?? 100);
        return $this->conditional($request, Runs::etag($run, $after.':'.$limit), fn () => [...$events->after($run, $after, $limit),
            'state' => $run->state, 'terminal' => \App\Services\AgentRuns\RunStates::terminal($run->state),
            'latestSeq' => $run->event_seq]);
    }

    public function cancel(Request $request, string $id, Runs $runs)
    {
        return $this->json(['run' => $runs->payload($runs->cancel($this->v2User($request)->id, $id))]);
    }

    public function tools(Request $request, string $id, Runs $runs, Manifest $manifest)
    {
        return $this->json(['manifest' => $manifest->for($runs->find($this->v2User($request)->id, $id))]);
    }

    public function decide(Request $request, string $id, Approvals $approvals, Broker $broker)
    {
        $user = $this->v2User($request);
        $data = $request->validate(['fingerprint' => ['required', 'regex:/^[a-f0-9]{64}$/D'],
            'decision' => 'required|in:allow,decline']);
        return $this->json(['action' => $broker->outcome($approvals->decide($user->id, $id, $data['fingerprint'], $data['decision']))]);
    }
}
