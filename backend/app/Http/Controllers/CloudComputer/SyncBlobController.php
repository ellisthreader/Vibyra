<?php
namespace App\Http\Controllers\CloudComputer;

use App\Http\Controllers\{Controller, Concerns\UserPayloads};
use App\Services\CloudComputer\{Computers, SyncBlobs, SyncDownload, SyncKeys, SyncProjects, SyncQueue};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Cloud sync, account side: the Mac uploads sealed bundles to the cloud computer and fetches the ones it sent back. */
final class SyncBlobController extends Controller
{
    use UserPayloads, SyncGuards;

    public function up(Request $request, string $name, SyncProjects $projects, SyncBlobs $blobs)
    {
        $user = $this->authenticatedUser($request)->id; $this->storing($user);
        $project = $projects->findOrFail($user, $name);
        app(\App\Services\CloudComputer\AccessProjects::class)->requireAllowed($project); // 409 project_not_allowed
        $q = $this->blobQuery($request);
        [$stream, $declared] = $this->body($request);
        $blobs->receive($project, 'up', $q, $stream, null, $declared);
        return response()->json(['ok' => true, 'project' => $projects->fresh($project->id)])->header('Cache-Control', 'private, no-store');
    }

    public function down(Request $request, SyncKeys $keys, SyncQueue $queue)
    {
        $user = $this->authenticatedUser($request)->id; $this->eligible($user);
        $d = $this->valid($request->query(), ['mac' => 'required|string|max:64']);
        $mac = $keys->findMac($user, strtolower($d['mac'])) ?? Computers::fail('unknown_mac', 'This Mac is not registered for cloud sync.', 404);
        $keys->touchMac($mac);
        return response()->json(['ok' => true, 'items' => $queue->down($user, $mac)])->header('Cache-Control', 'private, no-store');
    }

    public function file(Request $request, string $id, SyncDownload $download)
    {
        $user = $this->authenticatedUser($request)->id; $this->eligible($user);
        $blob = DB::table('cloud_sync_blobs')->where('id', $id)->where('user_id', $user)->where('direction', 'down')->first() ?? Computers::fail('unknown_blob', 'Unknown download.', 404);
        DB::table('cloud_sync_blobs')->where('id', $id)->whereNull('fetched_at')->update(['fetched_at' => now()]);
        return $download->response($request, $blob);
    }

    public function ack(Request $request, string $id, SyncQueue $queue)
    {
        $user = $this->authenticatedUser($request)->id; $this->eligible($user);
        $d = $this->valid($request->all(), ['applied' => 'required|boolean', 'error' => 'sometimes|nullable|string|max:300']);
        $queue->ack($user, $id, (bool) $d['applied'], $d['error'] ?? null);
        return response()->json(['ok' => true])->header('Cache-Control', 'private, no-store');
    }
}
