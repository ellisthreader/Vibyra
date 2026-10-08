<?php
namespace App\Services\CloudWorkspaces\Git;

use App\Services\ChatConnectors\Github\Client;
use App\Services\ChatConnectors\Installs;
use Illuminate\Support\Facades\{Cache, Http};

/**
 * What the owner's GitHub connection can reach. Only the default branch and
 * push permission are cached (60 s); the token itself never is.
 */
final class Repos
{
    public function __construct(private readonly Installs $installs) {}

    public function connected(int $user): bool
    {
        return in_array('github', $this->installs->installed($user), true);
    }

    /** Stored OAuth token for one call. Callers must never log, store or cache it. */
    public function token(int $user): string
    {
        app(\App\Services\CloudComputer\AccessProviders::class)->requireGithub($user);
        if (!$this->connected($user)) throw new GitRefused('github_not_connected', 'Connect GitHub in Settings first.', 409);
        return $this->installs->credential($user, 'github');
    }

    /** @return array{defaultBranch:string, canPush:bool, private:bool} */
    public function lookup(int $user, string $repo, string $token): array
    {
        $key = 'cloud-git:repo:'.$user.':'.strtolower($repo);
        if (is_array($hit = Cache::get($key))) return $hit;
        try {
            $r = Http::withToken($token)->acceptJson()->timeout(10)->withOptions(['allow_redirects' => false])
                ->withHeaders(['Accept' => 'application/vnd.github+json', 'X-GitHub-Api-Version' => '2022-11-28'])
                ->get('https://api.github.com'.Client::path($repo));
        } catch (\Throwable) { throw new GitRefused('github_unavailable', 'GitHub did not respond. Try again.', 503); }
        if (in_array($r->status(), [403, 404], true)) throw new GitRefused('repo_not_connected', 'That repository is not available to this account.');
        if ($r->status() === 401) throw new GitRefused('github_reconnect', 'GitHub access expired. Reconnect GitHub in Settings.', 409);
        $data = $r->json();
        if (!$r->successful() || !is_array($data) || !is_string($data['default_branch'] ?? null)) {
            throw new GitRefused('github_unavailable', 'GitHub could not describe that repository.', 503);
        }
        $out = ['defaultBranch' => $data['default_branch'], 'canPush' => (bool) ($data['permissions']['push'] ?? false),
            'private' => (bool) ($data['private'] ?? false)];
        Cache::put($key, $out, 60);
        return $out;
    }
}
