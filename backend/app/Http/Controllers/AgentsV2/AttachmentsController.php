<?php

namespace App\Http\Controllers\AgentsV2;

use App\Http\Controllers\Controller;
use App\Services\AgentRuns\{Leases, RunAttachments};
use App\Services\Vibes\Attachments;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Phase 8 attachments: owner upload, then a lease-fenced fetch by the runner of a run that names it. */
final class AttachmentsController extends Controller
{
    use V2Requests;

    public function store(Request $request, RunAttachments $attachments)
    {
        $user = $this->v2User($request);
        $request->validate(['file' => 'required|file|max:'.Attachments::MAX_KILOBYTES],
            ['file.max' => 'Attach a file under 2 MB.', 'file.uploaded' => 'Attach a file under 2 MB.']);
        return $this->json(['attachment' => $attachments->store($user->id, $request->file('file'))], 201);
    }

    public function fetch(Request $request, string $runtime, string $run, string $attachment, Leases $leases, RunAttachments $attachments)
    {
        $binding = $this->runner($request, $runtime);
        $generation = $request->query('generation');
        if (!is_numeric($generation) || (int) $generation < 1)
            \App\Services\AgentRuns\ApiError::throw(422, 'generation_required', 'Send the lease generation.');
        $row = DB::transaction(fn () => $leases->fenced($binding, $run, (int) $generation));
        [$file, $bytes] = $attachments->forRun($row, $attachment);
        return response($bytes, 200, ['Content-Type' => $file->mime, 'Content-Length' => (string) strlen($bytes),
            'Content-Disposition' => 'attachment; filename="'.addcslashes(preg_replace('/[^\x20-\x7e]/', '_', $file->name), '"\\').'"',
            'X-Content-Type-Options' => 'nosniff', 'Cache-Control' => 'private, no-store', 'X-Attachment-Sha256' => $file->sha256]);
    }
}
