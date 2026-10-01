<?php
namespace App\Http\Controllers\CloudComputer;

use App\Http\Controllers\{Controller, Concerns\UserPayloads};
use App\Services\CloudComputer\GithubRepoList;
use App\Services\CloudWorkspaces\Git\GitRefused;
use Illuminate\Http\Request;

/** GET api/cloud-computer/repos?q= : the owner's GitHub repos for the project picker. */
final class RepoController extends Controller
{
    use UserPayloads;

    public function index(Request $request, GithubRepoList $list)
    {
        $user = $this->authenticatedUser($request);
        $data = $request->validate(['q' => 'sometimes|nullable|string|max:100']);
        try { $repos = $list->list($user->id, (string) ($data['q'] ?? '')); }
        catch (GitRefused $e) { return $this->json(['ok' => false, 'code' => $e->errorCode, 'error' => $e->getMessage()], $e->status); }
        return $this->json(['ok' => true, 'repos' => $repos])->header('Cache-Control', 'private, no-store');
    }
}
