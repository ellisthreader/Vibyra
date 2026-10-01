<?php
namespace App\Http\Controllers\CloudWorkspaces;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Http\Controllers\Controller;
use App\Services\CloudWorkspaces\Git\{Branches, GitRefused, Pulls};
use Illuminate\Http\Request;

final class GitPullRequestController extends Controller
{
    use UserPayloads;

    /**
     * `project` is the repo ("owner/name") or, with `repo`, the project folder
     * name; a bare folder name cannot be resolved here without `repo`.
     */
    public function create(Request $request, Pulls $pulls)
    {
        $user = $this->authenticatedUser($request);
        $data = $request->validate(['project' => 'required|string|max:200', 'repo' => ['nullable', 'string', 'regex:'.Branches::REPO],
            'branch' => 'required|string|max:100', 'title' => 'required|string|max:256', 'body' => 'nullable|string|max:20000',
            'base' => 'nullable|string|max:100']);
        $repo = $data['repo'] ?? (preg_match(Branches::REPO, $data['project']) ? $data['project'] : null);
        if ($repo === null) return response()->json(['ok' => false, 'code' => 'project_repo_unknown', 'error' => 'That project has no GitHub repository.'], 422);
        if (!Branches::valid($data['branch']) || (isset($data['base']) && !Branches::valid($data['base']))) {
            return response()->json(['ok' => false, 'code' => 'bad_branch', 'error' => 'That branch name is not valid.'], 422);
        }
        try {
            $pr = $pulls->open($user->id, $repo, $data['branch'], $data['title'], $data['body'] ?? null, $data['base'] ?? null);
        } catch (GitRefused $e) {
            return response()->json(['ok' => false, 'code' => $e->errorCode, 'error' => $e->getMessage()], $e->status);
        }
        return response()->json(['ok' => true, ...$pr]);
    }
}
