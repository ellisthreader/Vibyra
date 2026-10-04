<?php

namespace App\Http\Controllers\AgentsV2;

use App\Http\Controllers\Controller;
use App\Services\AgentRuns\Access;
use App\Services\AgentRuns\ApiError;
use App\Services\AgentTriggers\ApiInvoke;
use App\Services\AgentTriggers\TriggerKinds;
use App\Services\AgentTriggers\Triggers;
use App\Services\AgentTriggers\Webhooks;
use App\Services\Membership\PlanLimits;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Triggers CRUD + event history, provider webhooks, and the v2 capability report. */
final class TriggersController extends Controller
{
    use V2Requests;

    private const FIELDS = ['filter' => 'sometimes|array', 'promptTemplate' => 'sometimes|string|max:8000',
        'ratePerHour' => 'sometimes|integer|min:1|max:60', 'runtimeId' => 'sometimes|nullable|uuid',
        'signingSecret' => 'sometimes|string|max:200'];

    public function index(Request $request, Triggers $triggers)
    {
        $user = $this->v2User($request);
        $data = $request->validate(['agentId' => 'sometimes|uuid']);
        return $this->json(['triggers' => array_map(fn ($t) => $triggers->payload($t), $triggers->list($user->id, $data['agentId'] ?? null))]);
    }

    public function store(Request $request, Triggers $triggers)
    {
        $user = $this->v2User($request);
        if (!app(PlanLimits::class)->allows($user, 'agents'))
            ApiError::throw(402, 'plan_required', \App\Http\Controllers\AgentsController::AGENTS_NEED_PRO);
        $data = $request->validate(['agentId' => 'required|uuid', 'kind' => ['required', Rule::in(array_keys(TriggerKinds::KINDS))],
            'connectionId' => 'sometimes|nullable|uuid', 'promptTemplate' => 'required|string|max:8000'] + self::FIELDS);
        [$trigger, $secret] = $triggers->create($user->id, $data);
        $payload = $triggers->payload($trigger);
        // The GitHub secret is shown once; paste it into the repository webhook settings.
        return $this->json(['trigger' => $payload, 'webhook' => $payload['webhookUrl'] ? ['url' => $payload['webhookUrl'],
            'secret' => $secret, 'contentType' => 'application/json'] : null], 201);
    }

    public function show(Request $request, string $id, Triggers $triggers)
    {
        return $this->json(['trigger' => $triggers->payload($triggers->find($this->v2User($request)->id, $id))]);
    }

    public function update(Request $request, string $id, Triggers $triggers)
    {
        $user = $this->v2User($request);
        $data = $request->validate(['revision' => 'required|integer|min:1'] + self::FIELDS);
        return $this->json(['trigger' => $triggers->payload($triggers->update($user->id, $id, $data))]);
    }

    public function pause(Request $request, string $id, Triggers $triggers)
    {
        $user = $this->v2User($request);
        $data = $request->validate(['paused' => 'required|boolean']);
        return $this->json(['trigger' => $triggers->payload($triggers->pause($user->id, $id, (bool) $data['paused']))]);
    }

    public function destroy(Request $request, string $id, Triggers $triggers)
    {
        $triggers->delete($this->v2User($request)->id, $id);
        return $this->json(['ok' => true]);
    }

    public function events(Request $request, string $id, Triggers $triggers)
    {
        $user = $this->v2User($request);
        $data = $request->validate(['limit' => 'sometimes|integer|min:1|max:100']);
        return $this->json(['events' => array_map(fn ($e) => $triggers->eventPayload($e),
            $triggers->events($user->id, $id, (int) ($data['limit'] ?? 20)))]);
    }

    /** Unauthenticated; the per-trigger HMAC secret is the authentication. */
    public function github(Request $request, string $trigger, Webhooks $webhooks)
    {
        return response()->json($webhooks->github($trigger, $request->getContent(), [
            'signature' => $request->header('X-Hub-Signature-256'), 'event' => $request->header('X-GitHub-Event'),
            'delivery' => $request->header('X-GitHub-Delivery')]), 202);
    }

    public function api(Request $request, string $trigger, Webhooks $webhooks)
    {
        return response()->json($webhooks->api($trigger, $request->getContent(), (string) $request->bearerToken(),
            $request->header('Idempotency-Key')), 202);
    }

    public function stripe(Request $request, string $trigger, Webhooks $webhooks)
    {
        return response()->json($webhooks->stripe($trigger, $request->getContent(), (string) $request->header('Stripe-Signature', '')), 202);
    }

    /** What V2 can do for this account. Never 503: disabled or out of cohort reports false. */
    public function capabilities(Request $request)
    {
        $on = app(Access::class)->allows($this->authenticatedUser($request)->id);
        return $this->json(['enabled' => $on, 'routines' => $on, 'triggers' => $on,
            'triggerKinds' => $on ? array_values(array_filter(array_keys(TriggerKinds::KINDS), fn ($kind) => $kind !== 'api.invoke' || ApiInvoke::enabled())) : []]);
    }
}
