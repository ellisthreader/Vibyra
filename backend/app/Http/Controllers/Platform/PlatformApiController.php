<?php

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use App\Models\AgentV2\Trigger;
use App\Services\AgentRuns\ApiError;
use App\Services\AgentTriggers\Webhooks;
use App\Services\Platform\PlatformRuns;
use Illuminate\Http\Request;

/** Key-authenticated reads and starts (`/api/platform/v1`). Scopes are enforced by the route's AuthenticateApiKey. */
final class PlatformApiController extends Controller
{
    public function runs(Request $request, PlatformRuns $runs)
    {
        $data = $request->validate(['agentId' => 'sometimes|uuid', 'limit' => 'sometimes|integer|min:1|max:50']);
        return response()->json(['runs' => array_map(fn ($r) => $runs->payload($r), $runs->list($request->user()->id, $data['agentId'] ?? null, (int) ($data['limit'] ?? 20)))]);
    }

    public function show(Request $request, string $id, PlatformRuns $runs)
    {
        return response()->json(['run' => $runs->payload($runs->find($request->user()->id, $id))]);
    }

    public function start(Request $request, PlatformRuns $runs)
    {
        $data = $request->validate(['prompt' => 'required|string', 'agentId' => 'sometimes|nullable|uuid', 'idempotencyKey' => 'sometimes|nullable|string']);
        $result = $runs->start($request->user(), $data['agentId'] ?? null, $data['prompt'], $request->header('Idempotency-Key') ?? $data['idempotencyKey'] ?? null);
        return response()->json($result, $result['replayed'] ? 200 : 201);
    }

    public function projects(Request $request, PlatformRuns $runs)
    {
        return response()->json(['projects' => $runs->projects($request->user()->id)]);
    }

    /** An API key with `triggers:invoke` calls one of its own account's `api.invoke` triggers. */
    public function invoke(Request $request, string $id, Webhooks $webhooks)
    {
        $trigger = Trigger::query()->where('user_id', $request->user()->id)->whereKey($id)->whereNull('deleted_at')->where('kind', 'api.invoke')->first();
        if (!$trigger || !\App\Services\AgentTriggers\ApiInvoke::enabled()) ApiError::throw(404, 'trigger_not_found', 'Unknown trigger.');
        return response()->json($webhooks->invoke($trigger, $request->getContent(), $request->header('Idempotency-Key')), 202);
    }
}
