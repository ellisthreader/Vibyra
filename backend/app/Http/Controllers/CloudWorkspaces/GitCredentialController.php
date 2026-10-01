<?php
namespace App\Http\Controllers\CloudWorkspaces;

use App\Http\Controllers\Controller;
use App\Services\CloudWorkspaces\Git\{Branches, Credentials, GitRefused};
use App\Services\CloudWorkspaces\Runtime;
use Illuminate\Http\Request;

final class GitCredentialController extends Controller
{
    public function show(Request $request, string $workspace, Runtime $runtime, Credentials $credentials)
    {
        $w = $runtime->authenticate($workspace, (string) $request->bearerToken());
        if (($w->kind ?? 'project') !== 'computer') {
            return response()->json(['ok' => false, 'code' => 'not_a_computer', 'error' => 'Only a cloud computer can request a git credential.'], 403);
        }
        $data = $request->validate(['repo' => ['required', 'string', 'regex:'.Branches::REPO], 'op' => 'required|in:fetch,push',
            'branch' => ['nullable', 'string', 'max:100']]);
        try {
            $out = $credentials->mint($w, $data['repo'], $data['op'], $data['branch'] ?? null);
        } catch (GitRefused $e) {
            return response()->json(['ok' => false, 'code' => $e->errorCode, 'error' => $e->getMessage()], $e->status);
        }
        return response()->json(['ok' => true, ...$out])->header('Cache-Control', 'private, no-store');
    }
}
