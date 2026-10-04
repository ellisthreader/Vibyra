<?php
namespace App\Http\Controllers\CloudComputer;

use App\Http\Controllers\{Controller, Concerns\UserPayloads};
use App\Services\CloudComputer\{SyncProjects, SyncUploadParts};
use Illuminate\Http\Request;

/** `PUT /api/cloud-computer/sync/projects/{name}/up-part`: one piece of a resumable upload (see SyncUploadParts). */
final class SyncPartController extends Controller
{
    use UserPayloads, SyncGuards;

    public function up(Request $request, string $name, SyncProjects $projects, SyncUploadParts $parts)
    {
        $user = $this->authenticatedUser($request)->id; $this->storing($user);
        $project = $projects->findOrFail($user, $name);
        app(\App\Services\CloudComputer\AccessProjects::class)->requireAllowed($project); // 409 project_not_allowed
        $q = $this->blobQuery($request);
        $r = $this->valid($request->query(), ['offset' => 'required|integer|min:0', 'total' => 'required|integer|min:1']);
        [$stream, $declared] = $this->body($request);
        $result = $parts->receive($project, $q, (int) $r['offset'], (int) $r['total'], $stream, $declared);
        $body = $result['complete'] ? ['ok' => true, 'complete' => true, 'project' => $projects->fresh($project->id)]
            : ['ok' => true, 'complete' => false, 'received' => $result['received']];
        return response()->json($body)->header('Cache-Control', 'private, no-store');
    }
}
