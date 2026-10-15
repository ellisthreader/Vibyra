<?php
namespace App\Http\Controllers\CloudComputer;

use App\Http\Controllers\{Controller, Concerns\UserPayloads};
use App\Services\CloudComputer\Activity\ActivityFeed;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/** GET /api/cloud-computer/activity?since=<iso>: the "while you were away" summary and the live panel (contract section 2). */
final class ActivityController extends Controller
{
    use UserPayloads, SyncGuards;

    public function show(Request $request, ActivityFeed $feed)
    {
        $user = $this->authenticatedUser($request)->id;
        $d = $this->valid($request->query(), ['since' => ['sometimes', 'string', 'max:40']]);
        $since = null;
        if (isset($d['since'])) {
            try { $since = Carbon::parse($d['since']); }
            catch (\Throwable) { \App\Services\CloudComputer\Computers::fail('invalid_request', 'since must be an ISO 8601 time.', 422); }
        }
        return response()->json(['ok' => true] + $feed->payload($user, $since))->header('Cache-Control', 'private, no-store');
    }
}
