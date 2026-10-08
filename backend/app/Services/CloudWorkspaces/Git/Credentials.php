<?php
namespace App\Services\CloudWorkspaces\Git;

use Illuminate\Support\Facades\Log;

/**
 * The only place a GitHub token leaves the server for a git remote, and only to
 * the owner's cloud computer, only for a repo the owner's connection reaches,
 * and for push only on `vibyra/<task>` branches that are not the default.
 *
 * SCOPE RISK: the connector holds a classic OAuth token with `repo` scope, and
 * GitHub does not expire such tokens, so `expiresAt` is a client-side contract
 * (<= 10 min), not a GitHub-enforced expiry. A narrower GitHub App installation
 * token (contents + pull_requests per repo) would make it real; branch
 * protection on the default branch is the server-side backstop. NOT implemented:
 * until then the token is still the owner's full OAuth token, now limited only to
 * repos in this computer's project list (queued clones or Host-reported origins).
 */
final class Credentials
{
    public const TTL_MINUTES = 10;

    public function __construct(private readonly Repos $repos) {}

    public function mint(object $workspace, string $repo, string $op, ?string $branch): array
    {
        $user = (int) $workspace->user_id;
        try { app(\App\Services\CloudComputer\AccessProviders::class)->requireGithub($user); }
        catch (GitRefused $e) { $this->audit($workspace, $repo, $op, $branch, $e->errorCode); throw $e; }
        // Only a repo this computer actually has (or was asked to clone) is eligible, never "any repo the owner can reach".
        if (($workspace->kind ?? 'project') !== 'computer' || !in_array(strtolower($repo), app(\App\Services\CloudComputer\Projects::class)->repos($workspace), true)) {
            $this->audit($workspace, $repo, $op, $branch, 'repo_not_in_computer');
            throw new GitRefused('repo_not_in_computer', 'That repository is not one of this cloud computer\'s projects.');
        }
        if ($op === 'push') {
            if ($branch === null || !Branches::isAgentBranch($branch) || Branches::protectedLooking($branch)) {
                $this->audit($workspace, $repo, $op, $branch, 'refused_branch');
                throw new GitRefused('push_branch_not_allowed', 'The cloud computer may only push branches named vibyra/<task>.');
            }
        }
        try {
            $token = $this->repos->token($user);
            $info = $this->repos->lookup($user, $repo, $token);
            if ($op === 'push') {
                if ($branch === $info['defaultBranch']) throw new GitRefused('push_default_branch_refused', 'The default branch is never pushed from the cloud computer.');
                if (!$info['canPush']) throw new GitRefused('push_not_permitted', 'The connected GitHub account cannot push to that repository.');
            }
        } catch (GitRefused $e) {
            $this->audit($workspace, $repo, $op, $branch, $e->errorCode);
            throw $e;
        }
        $expires = now()->addMinutes(self::TTL_MINUTES);
        $this->audit($workspace, $repo, $op, $branch, 'issued');
        return ['username' => 'x-access-token', 'password' => $token, 'expiresAt' => $expires->toIso8601String()];
    }

    /** Metadata only: never the token, never file content. */
    private function audit(object $w, string $repo, string $op, ?string $branch, string $outcome): void
    {
        Log::info('cloud.git.credential', ['workspace' => $w->id, 'user' => $w->user_id, 'repo' => $repo, 'op' => $op,
            'branch' => $branch === null ? null : substr($branch, 0, 100), 'outcome' => $outcome]);
    }
}
