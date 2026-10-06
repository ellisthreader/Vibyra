<?php
namespace App\Http\Controllers\CloudComputer;

use App\Http\Controllers\{Controller, Concerns\UserPayloads};
use App\Services\CloudComputer\{AccessProjects, AccessProviders, Computers, ConnectConsent, SyncKeys, SyncLogins, SyncProjects, SyncRetention, Wake};
use Illuminate\Http\Request;

/** Cloud sync, account side (Mac and phone, bearer session): keys, the project list, project grants. */
final class SyncController extends Controller
{
    use UserPayloads, SyncGuards;

    public function index(Request $request, SyncKeys $keys, SyncProjects $projects, SyncRetention $retention, SyncLogins $logins)
    {
        $user = $this->authenticatedUser($request)->id; $this->eligible($user);
        // `?mac=<deviceId>`: this Mac checked in (the phone shows when its Mac last did). An unknown id is ignored.
        $mac = $request->query('mac');
        // A Mac checking in while work waits on a sleeping computer starts it (Wake::forSync).
        if (is_string($mac) && strlen($mac) <= 64 && ($m = $keys->findMac($user, strtolower($mac)))) { $keys->checkIn($m); $this->nudge($user); }
        $consent = app(ConnectConsent::class);
        return $this->reply(['enabled' => true, 'connected' => $consent->connected($user), 'vmKey' => $keys->vmKey($user), 'macs' => $keys->macs($user), 'projects' => $projects->all($user),
            'usedBytes' => $retention->usedBytes($user), 'limitBytes' => $retention->limitBytes(), 'logins' => $logins->payload($user),
            'consent' => $consent->payload($user),
            'access' => ['projectKeys' => app(AccessProjects::class)->allowedKeys($user), 'codexCarryOver' => app(AccessProviders::class)->codexCarryOver($user)]]);
    }

    public function putMac(Request $request, string $deviceId, SyncKeys $keys)
    {
        $user = $this->authenticatedUser($request)->id; $this->storing($user);
        $d = $this->valid($request->all(), ['publicKey' => ['required', 'string', 'regex:/^[a-f0-9]{64}$/'], 'name' => 'required|string|max:120', 'replace' => 'sometimes|boolean']);
        return $this->reply(['mac' => $keys->mac($keys->putMac($user, strtolower($deviceId), $d['publicKey'], trim($d['name']), (bool) ($d['replace'] ?? false)))]);
    }

    public function project(Request $request, SyncProjects $projects)
    {
        $user = $this->authenticatedUser($request)->id; $this->storing($user);
        $d = $this->valid($request->all(), ['projectKey' => ['required', 'string', 'regex:'.SyncProjects::KEY], 'name' => ['required', 'string', 'max:64', 'regex:'.\App\Services\CloudComputer\Projects::NAME],
            'skipped' => 'sometimes|array', 'skipped.reason' => 'required_with:skipped|string|max:60']);
        if (!SyncProjects::validName($d['name'])) Computers::fail('invalid_request', 'That is not a usable project name.', 422);
        $project = $projects->grant($user, $d['projectKey'], $d['name'], $d['skipped']['reason'] ?? null);
        $this->nudge($user); // a first project and no computer key yet: start it so the Mac has something to seal to
        return $this->reply(['project' => $projects->payload($project)]);
    }

    /**
     * PUT macs/{deviceId}/status: what this Mac is doing (docs/cloud-sync-contract.md). Needs no agreement: a paused Mac must
     * still be able to say so. An unknown Mac gets 404 mac_unknown and registers again (PUT macs/{deviceId}) once connected.
     */
    public function report(Request $request, string $deviceId, SyncKeys $keys)
    {
        $user = $this->authenticatedUser($request)->id; $this->eligible($user);
        $key = ['string', 'regex:'.SyncProjects::KEY];
        $d = $this->valid($request->all(), ['paused' => 'required|boolean', 'gate' => 'sometimes|nullable|string|max:32',
            'current' => 'sometimes|nullable|array', 'current.projectKey' => ['required_with:current', ...$key], 'current.kind' => 'sometimes|in:code,transcripts',
            'current.sent' => 'sometimes|integer|min:0', 'current.total' => 'sometimes|integer|min:0',
            'projects' => 'sometimes|array|max:'.AccessProjects::MAX_ITEMS, 'projects.*' => 'array', 'projects.*.projectKey' => ['required', ...$key],
            'projects.*.phase' => 'required|in:queued,preparing,uploading,done,error', 'projects.*.code' => 'sometimes|nullable|string|max:60',
            'projects.*.message' => 'sometimes|nullable|string|max:300', 'projects.*.bytes' => 'sometimes|nullable|integer|min:0']);
        $mac = $keys->findMac($user, strtolower($deviceId)) ?? Computers::fail('mac_unknown', 'This Mac is not registered for cloud sync.', 404);
        $c = $d['current'] ?? null;
        $keys->putReport($mac, ['paused' => (bool) $d['paused'], 'gate' => $d['gate'] ?? null,
            'current' => $c ? ['projectKey' => strtolower($c['projectKey']), 'kind' => $c['kind'] ?? 'code', 'sent' => (int) ($c['sent'] ?? 0), 'total' => (int) ($c['total'] ?? 0)] : null,
            'projects' => array_map(fn ($p) => array_filter(['projectKey' => strtolower($p['projectKey']), 'phase' => $p['phase'], 'code' => $p['code'] ?? null,
                'message' => $p['message'] ?? null, 'bytes' => isset($p['bytes']) ? (int) $p['bytes'] : null], fn ($v) => $v !== null), $d['projects'] ?? [])]);
        if (!$d['paused']) $this->nudge($user);
        return $this->reply([]);
    }

    /**
     * POST repair `{projectKey?}`: "Sync again" without losing anything. The project (or every live one) starts over with a full
     * upload from the Mac, a failed apply is cleared, and the computer is started to take it. Disconnect is never the fix.
     */
    public function repair(Request $request, SyncProjects $projects)
    {
        $user = $this->authenticatedUser($request)->id; $this->storing($user);
        $d = $this->valid($request->all(), ['projectKey' => ['sometimes', 'nullable', 'string', 'regex:'.SyncProjects::KEY]]);
        $n = $projects->repair($user, isset($d['projectKey']) ? strtolower($d['projectKey']) : null);
        app(Wake::class)->forSyncLater($user, true);
        return $this->reply(['repaired' => $n, 'projects' => $projects->all($user)]);
    }

    /** Work waiting on a sleeping computer starts it (debounced and bounded in Wake::forSync). */
    private function nudge(int $user): void
    {
        if (app(Wake::class)->syncWaiting($user)) app(Wake::class)->forSyncLater($user);
    }

    public function remove(Request $request, string $name, SyncProjects $projects)
    {
        $user = $this->authenticatedUser($request)->id; $this->eligible($user);
        $projects->remove($user, $name);
        return $this->reply([]);
    }

    private function reply(array $data)
    {
        return response()->json(['ok' => true] + $data)->header('Cache-Control', 'private, no-store');
    }
}
