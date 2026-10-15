<?php
namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Services\LiveActivities\{Preferences, Tokens};
use Illuminate\Http\Request;

/** iPhone Live Activities: preferences, the push-to-start token and per-run activity tokens. */
final class LiveActivitiesController extends Controller
{
    use UserPayloads;

    private function ready(): void
    {
        abort_unless(config('live_activities.enabled'), 503, 'Live Activities are not available yet.');
    }

    public function preferences(Request $r, Preferences $p)
    {
        $user = $this->authenticatedUser($r);
        if ($r->isMethod('patch')) {
            $this->ready();
            $data = $r->validate(['enabled' => 'sometimes|boolean', 'details' => 'sometimes|boolean']);
            $saved = $p->save($user->id, $data);
        }
        return $this->privateJson(['preferences' => $saved ?? $p->get($user->id), 'available' => (bool) config('live_activities.enabled')]);
    }

    public function pushToStart(Request $r, Tokens $tokens)
    {
        $this->authenticatedUser($r);
        $this->ready();
        $session = $this->authenticatedSession($r);
        if ($r->isMethod('delete')) {
            $d = $r->validate(['deviceId' => 'required|uuid']);
            $tokens->forgetPushToStart($session, $d['deviceId']);
        } else {
            $d = $r->validate(['deviceId' => 'required|uuid', 'token' => ['required', 'string', 'regex:'.Tokens::HEX]]);
            $tokens->registerPushToStart($session, $d['deviceId'], $d['token']);
        }
        return $this->privateJson(['ok' => true]);
    }

    public function runToken(Request $r, string $runId, Tokens $tokens)
    {
        $this->authenticatedUser($r);
        $this->ready();
        $session = $this->authenticatedSession($r);
        if ($r->isMethod('delete')) {
            $d = $r->validate(['deviceId' => 'required|uuid']);
            $tokens->endRun($session, $d['deviceId'], $runId);
            return $this->privateJson(['ok' => true]);
        }
        $d = $r->validate(['deviceId' => 'required|uuid', 'agentId' => 'required|uuid', 'token' => ['required', 'string', 'regex:'.Tokens::HEX]]);
        return $this->privateJson($tokens->registerActivity($session, $d['deviceId'], $runId, $d['agentId'], $d['token']));
    }

    /** Sign-out on this iPhone: forget every card and the start token for the device. */
    public function clear(Request $r, Tokens $tokens)
    {
        $this->authenticatedUser($r);
        $d = $r->validate(['deviceId' => 'required|uuid']);
        $tokens->revokeDevice($tokens->device($this->authenticatedSession($r), $d['deviceId'])->id);
        return $this->privateJson(['ok' => true]);
    }

    private function privateJson(array $data)
    {
        return response()->json(['version' => 1, ...$data])->header('Cache-Control', 'private, no-store');
    }
}
