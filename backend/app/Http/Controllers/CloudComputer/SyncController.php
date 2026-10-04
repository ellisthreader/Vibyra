<?php
namespace App\Http\Controllers\CloudComputer;

use App\Http\Controllers\{Controller, Concerns\UserPayloads};
use App\Services\CloudComputer\{SyncKeys, SyncLogins, SyncProjects, SyncRetention};
use Illuminate\Http\Request;

/** Cloud sync, account side (Mac and phone, bearer session): keys, the project list, project grants. */
final class SyncController extends Controller
{
    use UserPayloads, SyncGuards;

    public function index(Request $request, SyncKeys $keys, SyncProjects $projects, SyncRetention $retention, SyncLogins $logins)
    {
        $user = $this->authenticatedUser($request)->id; $this->eligible($user);
        return $this->reply(['enabled' => true, 'vmKey' => $keys->vmKey($user), 'macs' => $keys->macs($user), 'projects' => $projects->all($user),
            'usedBytes' => $retention->usedBytes($user), 'limitBytes' => $retention->limitBytes(), 'logins' => $logins->payload($user),
            'consent' => app(\App\Services\CloudComputer\ConnectConsent::class)->payload($user),
            'access' => ['projectKeys' => app(\App\Services\CloudComputer\AccessProjects::class)->allowedKeys($user),
                'codexCarryOver' => app(\App\Services\CloudComputer\AccessProviders::class)->codexCarryOver($user)]]);
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
        if (!SyncProjects::validName($d['name'])) \App\Services\CloudComputer\Computers::fail('invalid_request', 'That is not a usable project name.', 422);
        return $this->reply(['project' => $projects->payload($projects->grant($user, $d['projectKey'], $d['name'], $d['skipped']['reason'] ?? null))]);
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
