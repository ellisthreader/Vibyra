<?php

namespace App\Http\Controllers\AgentsV2;

use App\Http\Controllers\Controller;
use App\Services\AgentRuns\ApiError;
use App\Services\AgentSchedules\Recurrence;
use App\Services\AgentSchedules\Schedules;
use App\Services\Membership\PlanLimits;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;

/** Routines: CRUD, pause, next-run preview and occurrence history. */
final class SchedulesController extends Controller
{
    use V2Requests;

    private const FIELDS = ['title' => 'sometimes|nullable|string|max:120', 'prompt' => 'sometimes|string|max:20000',
        'timezone' => 'sometimes|string|max:64', 'recurrence' => 'sometimes|array', 'runtimeId' => 'sometimes|nullable|uuid',
        'catchUpMinutes' => 'sometimes|integer|min:0|max:1440', 'overlap' => 'sometimes|in:skip,queue'];

    public function index(Request $request, Schedules $schedules)
    {
        $user = $this->v2User($request);
        $data = $request->validate(['agentId' => 'sometimes|uuid']);
        return $this->json(['schedules' => array_map(fn ($s) => $schedules->payload($s), $schedules->list($user->id, $data['agentId'] ?? null))]);
    }

    public function store(Request $request, Schedules $schedules)
    {
        $user = $this->v2User($request);
        if (!app(PlanLimits::class)->allows($user, 'agents'))
            ApiError::throw(402, 'plan_required', \App\Http\Controllers\AgentsController::AGENTS_NEED_PRO);
        $data = $request->validate(['agentId' => 'required|uuid', 'prompt' => 'required|string|max:20000',
            'timezone' => 'required|string|max:64', 'recurrence' => 'required|array'] + self::FIELDS);
        return $this->json(['schedule' => $schedules->payload($schedules->create($user->id, $data))], 201);
    }

    public function show(Request $request, string $id, Schedules $schedules)
    {
        return $this->json(['schedule' => $schedules->payload($schedules->find($this->v2User($request)->id, $id))]);
    }

    public function update(Request $request, string $id, Schedules $schedules)
    {
        $user = $this->v2User($request);
        $data = $request->validate(['revision' => 'required|integer|min:1'] + self::FIELDS);
        return $this->json(['schedule' => $schedules->payload($schedules->update($user->id, $id, $data))]);
    }

    public function pause(Request $request, string $id, Schedules $schedules)
    {
        $user = $this->v2User($request);
        $data = $request->validate(['paused' => 'required|boolean']);
        return $this->json(['schedule' => $schedules->payload($schedules->pause($user->id, $id, (bool) $data['paused']))]);
    }

    public function destroy(Request $request, string $id, Schedules $schedules)
    {
        $schedules->delete($this->v2User($request)->id, $id);
        return $this->json(['ok' => true]);
    }

    public function occurrences(Request $request, string $id, Schedules $schedules)
    {
        $user = $this->v2User($request);
        $data = $request->validate(['limit' => 'sometimes|integer|min:1|max:100']);
        return $this->json(['occurrences' => array_map(fn ($o) => $schedules->occurrencePayload($o),
            $schedules->occurrences($user->id, $id, (int) ($data['limit'] ?? 20)))]);
    }

    /** Shows the calculated next runs (UTC and local) before saving. */
    public function preview(Request $request)
    {
        $this->v2User($request);
        $data = $request->validate(['timezone' => 'required|string|max:64', 'recurrence' => 'required|array',
            'count' => 'sometimes|integer|min:1|max:10']);
        $zone = Recurrence::zone($data['timezone']);
        $recurrence = Recurrence::normalize($data['recurrence'], $zone);
        $next = Recurrence::upcoming($recurrence, $zone, CarbonImmutable::now(), (int) ($data['count'] ?? 5));
        return $this->json(['description' => Recurrence::describe($recurrence), 'next' => array_map(fn ($at) => [
            'at' => $at->toIso8601String(), 'local' => $at->setTimezone($zone)->toIso8601String()], $next)]);
    }
}
