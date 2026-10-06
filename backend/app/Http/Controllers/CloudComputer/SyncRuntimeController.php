<?php
namespace App\Http\Controllers\CloudComputer;

use App\Http\Controllers\Controller;
use App\Services\CloudComputer\{Computers, SyncBlobs, SyncDownload, SyncKeys, SyncLogins, SyncProjects, SyncQueue};
use Illuminate\Http\Request;

/** Cloud sync, VM side. The runtime bearer names the workspace, so the owner is never taken from the request. */
final class SyncRuntimeController extends Controller
{
    use SyncGuards;

    public function key(Request $request, string $workspace, SyncKeys $keys)
    {
        $w = $this->computerFor($request, $workspace);
        $d = $this->valid($request->all(), ['publicKey' => ['required', 'string', 'regex:/^[a-f0-9]{64}$/']]);
        $keys->setVmKey($w->user_id, $d['publicKey']);
        return $this->reply([]);
    }

    public function macs(Request $request, string $workspace, SyncKeys $keys)
    {
        $w = $this->computerFor($request, $workspace);
        return $this->reply(['macs' => array_map(fn ($m) => ['id' => $m['id'], 'publicKey' => $m['publicKey']], $keys->macs($w->user_id))]);
    }

    public function pending(Request $request, string $workspace, SyncQueue $queue)
    {
        return $this->reply($queue->pending($this->computerFor($request, $workspace)->user_id));
    }

    public function state(Request $request, string $workspace, SyncQueue $queue)
    {
        return $this->reply(['projects' => $queue->state($this->computerFor($request, $workspace)->user_id)]);
    }

    public function status(Request $request, string $workspace, SyncKeys $keys)
    {
        $w = $this->computerFor($request, $workspace);
        // {applying, keyOk?, lastError?: {code, message, project?}|null}; older images send only applying. null clears the error.
        $d = $this->valid($request->all(), ['applying' => 'required|boolean', 'keyOk' => 'sometimes|nullable|boolean', 'lastError' => 'sometimes|nullable|array',
            'lastError.code' => 'required_with:lastError|string|max:60', 'lastError.message' => 'sometimes|nullable|string|max:300', 'lastError.project' => 'sometimes|nullable|string|max:64']);
        $error = isset($d['lastError']) ? array_filter(['code' => $d['lastError']['code'], 'message' => $d['lastError']['message'] ?? null, 'project' => $d['lastError']['project'] ?? null], fn ($v) => $v !== null) : null;
        $keys->setApplying($w->user_id, (bool) $d['applying'], isset($d['keyOk']) ? (bool) $d['keyOk'] : null, $error, $request->has('lastError') && $error === null);
        return $this->reply([]);
    }

    public function blob(Request $request, string $workspace, string $id, SyncQueue $queue, SyncDownload $download, SyncLogins $logins)
    {
        $user = $this->computerFor($request, $workspace)->user_id;
        return $download->response($request, $logins->blob($user, $id) ?? $queue->upBlob($user, $id));
    }

    public function applied(Request $request, string $workspace, string $id, SyncQueue $queue, SyncLogins $logins)
    {
        $w = $this->computerFor($request, $workspace);
        $d = $this->valid($request->all(), ['ok' => 'required|boolean', 'head' => ['sometimes', 'nullable', 'string', 'regex:/^[a-f0-9]{40}$/'], 'state' => 'sometimes|nullable|in:synced,diverged',
            'error' => 'sometimes|nullable|string|max:300', 'needFull' => 'sometimes|boolean',
            'code' => 'sometimes|nullable|string|max:60', 'message' => 'sometimes|nullable|string|max:300']);
        if (!$logins->applied($w->user_id, $id, $d)) $queue->applied($w->user_id, $id, $d);
        return $this->reply([]);
    }

    public function down(Request $request, string $workspace, string $name, SyncProjects $projects, SyncKeys $keys, SyncBlobs $blobs)
    {
        $w = $this->computerFor($request, $workspace);
        $project = $projects->findOrFail($w->user_id, $name);
        $q = $this->blobQuery($request);
        $mac = $keys->findMac($w->user_id, strtolower((string) $request->query('mac'))) ?? Computers::fail('unknown_mac', 'That Mac is not registered for cloud sync.', 404);
        [$stream, $declared] = $this->body($request);
        $blobs->receive($project, 'down', $q, $stream, $mac, $declared);
        return $this->reply([]);
    }

    private function reply(array $data)
    {
        return response()->json(['ok' => true] + $data)->header('Cache-Control', 'private, no-store');
    }
}
