<?php
namespace App\Http\Controllers\CloudComputer;

use App\Http\Controllers\Controller;
use App\Services\CloudComputer\Activity\{Fanout, HostEvents};
use App\Services\CloudWorkspaces\Runtime;
use Illuminate\Http\{JsonResponse, Request};
use Illuminate\Support\Facades\{DB, Validator};

/**
 * POST /api/cloud-computer/host-events (also /api/cloud-runtime/{workspace}/host-events): the Cloud Host reports phase
 * changes with its runtime bearer. The owner is the workspace's, never taken from the request. Metadata only.
 */
final class HostEventsController extends Controller
{
    /** A batch of 100 small events is a few kilobytes; anything near this is not one. */
    private const MAX_BYTES = 65536;

    public function store(Request $request, HostEvents $events, Fanout $fanout, ?string $workspace = null): JsonResponse
    {
        if (strlen($request->getContent()) > self::MAX_BYTES) return $this->refuse('payload_too_large', 'Too much data in one report.', 413);
        $w = $this->computer($request, $workspace);
        $v = Validator::make($request->all(), ['events' => 'required|array|min:1|max:'.HostEvents::MAX_BATCH]);
        if ($v->fails()) return $this->refuse('invalid_request', (string) $v->errors()->first(), 422);
        $result = $events->ingest($w, array_values((array) $request->input('events')));
        $fanout->run($w, $result['new']);
        return response()->json(['ok' => true, 'accepted' => $result['accepted'], 'duplicates' => $result['duplicates'], 'rejected' => $result['rejected']]);
    }

    /** The workspace comes from the path, the `X-Vibyra-Workspace` header or the body; failing those, from the bearer's hash. */
    private function computer(Request $request, ?string $workspace): object
    {
        $token = (string) $request->bearerToken();
        $id = $workspace ?? $request->header('X-Vibyra-Workspace') ?? $request->input('workspaceId');
        if (!is_string($id) || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $id)) {
            $id = $token === '' ? null : DB::table('cloud_workspaces')->where('runtime_token_hash', hash('sha256', $token))->where('kind', 'computer')->value('id');
        }
        abort_unless(is_string($id), 401, 'Runtime authority expired.');
        $w = app(Runtime::class)->authenticate(strtolower($id), $token);
        abort_unless(($w->kind ?? 'project') === 'computer', 403, 'This workspace is not a cloud computer.');
        return $w;
    }

    private function refuse(string $code, string $message, int $status): JsonResponse
    {
        return response()->json(['ok' => false, 'code' => $code, 'message' => $message, 'error' => $message], $status);
    }
}
