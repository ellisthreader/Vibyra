<?php

namespace App\Http\Controllers\AgentsV2;

use App\Http\Controllers\Controller;
use App\Services\AgentRuns\{Activity, ApiError, Roster};
use Illuminate\Http\Request;

/** Phase 8 overview reads: the cross-teammate activity feed and the v2 roster with per-device unread. */
final class OverviewController extends Controller
{
    use V2Requests;

    public function activity(Request $request, Activity $activity)
    {
        $user = $this->v2User($request);
        $data = $request->validate(['cursor' => 'sometimes|nullable|string|max:200',
            'provider' => ['sometimes', 'nullable', 'regex:/^[a-z][a-z0-9_]{1,59}$/D'], 'agentId' => 'sometimes|nullable|uuid',
            'limit' => 'sometimes|integer|min:1|max:100']);
        return $this->json($activity->page($user->id, $data, (int) ($data['limit'] ?? 30)));
    }

    public function roster(Request $request, Roster $roster)
    {
        $user = $this->v2User($request);
        return $this->json(['teammates' => $roster->list($user->id, $this->device($request))]);
    }

    public function read(Request $request, string $agentId, Roster $roster)
    {
        $user = $this->v2User($request);
        $data = $request->validate(['cursor' => 'required|string|size:64']);
        $roster->read($user->id, $agentId, $this->device($request), $data['cursor']);
        return $this->json(['ok' => true]);
    }

    /** One read marker per device: the declared `X-Vibyra-Device` id, else this signed-in session. */
    private function device(Request $request): string
    {
        $declared = $request->header('X-Vibyra-Device');
        if ($declared === null || $declared === '') return 's:'.$this->authenticatedSession($request)->id;
        if (!preg_match('/^[A-Za-z0-9._:-]{1,64}$/D', $declared))
            ApiError::throw(422, 'invalid_device', 'X-Vibyra-Device must be 1–64 letters, digits or . _ : -');
        return 'd:'.$declared;
    }
}
