<?php
namespace App\Services\CloudWorkspaces\Git;

use App\Services\ChatConnectors\Github\Client;
use Illuminate\Support\Facades\Http;

/**
 * Opens the pull request for a branch the cloud computer pushed. The head must
 * be `vibyra/<task>`; the base defaults to the repo's default branch. The PR is
 * opened by the owner's connection, so GitHub attributes it to them.
 */
final class Pulls
{
    public function __construct(private readonly Repos $repos) {}

    /** @return array{url:string, number:int, existing:bool, files:?int, additions:?int, deletions:?int, commits:?int} */
    public function open(int $user, string $repo, string $head, string $title, ?string $body, ?string $base): array
    {
        if (!Branches::isAgentBranch($head)) throw new GitRefused('branch_not_allowed', 'Only vibyra/<task> branches can be opened as a pull request.', 422);
        if ($base === $head) throw new GitRefused('bad_base', 'The base branch must differ from the head branch.', 422);
        $token = $this->repos->token($user);
        $info = $this->repos->lookup($user, $repo, $token);
        $base ??= $info['defaultBranch'];
        if ($base === $head) throw new GitRefused('bad_base', 'The base branch must differ from the head branch.', 422);
        $path = Client::path($repo);
        try {
            $r = $this->request($token)->post('https://api.github.com'.$path.'/pulls',
                ['title' => $title, 'head' => $head, 'base' => $base, 'body' => $body ?? '']);
        } catch (\Throwable) { throw new GitRefused('github_unavailable', 'GitHub did not respond. Check the repository before retrying.', 503); }
        if ($r->status() === 201) return $this->shape($r->json(), false);
        $messages = strtolower(implode(' | ', array_map(fn ($e) => is_array($e) ? (string) ($e['message'] ?? '') : (string) $e, (array) ($r->json('errors') ?? []))));
        if ($r->status() === 422) {
            if (str_contains($messages, 'pull request already exists')) return $this->existing($token, $repo, $head, $path);
            if (str_contains($messages, 'no commits between')) throw new GitRefused('no_commits', 'The branch has no commits beyond the base branch.', 422);
            throw new GitRefused('github_rejected', 'GitHub rejected the pull request. Check that the branch was pushed.', 422);
        }
        throw match ($r->status()) {
            401 => new GitRefused('github_reconnect', 'GitHub access expired. Reconnect GitHub in Settings.', 409),
            403, 404 => new GitRefused('repo_not_connected', 'That repository or branch is not available to this account.', 403),
            default => new GitRefused('github_unavailable', 'GitHub could not open the pull request. Try again later.', 503),
        };
    }

    private function existing(string $token, string $repo, string $head, string $path): array
    {
        $owner = explode('/', $repo)[0];
        try {
            $r = $this->request($token)->get('https://api.github.com'.$path.'/pulls', ['head' => $owner.':'.$head, 'state' => 'open', 'per_page' => 1]);
        } catch (\Throwable) { $r = null; }
        $first = $r && $r->successful() ? ($r->json()[0] ?? null) : null;
        if (!is_array($first)) throw new GitRefused('github_unavailable', 'A pull request exists but could not be read.', 503);
        return $this->shape($first, true);
    }

    private function shape(mixed $pr, bool $existing): array
    {
        $url = is_array($pr) ? ($pr['html_url'] ?? null) : null;
        if (!is_array($pr) || !is_int($pr['number'] ?? null) || !is_string($url) || !str_starts_with($url, 'https://github.com/')) {
            throw new GitRefused('github_unavailable', 'GitHub returned an unreadable response.', 503);
        }
        $n = fn ($k) => is_int($pr[$k] ?? null) ? $pr[$k] : null;
        return ['url' => $url, 'number' => $pr['number'], 'existing' => $existing, 'files' => $n('changed_files'),
            'additions' => $n('additions'), 'deletions' => $n('deletions'), 'commits' => $n('commits')];
    }

    private function request(string $token): \Illuminate\Http\Client\PendingRequest
    {
        return Http::withToken($token)->acceptJson()->timeout(12)->withOptions(['allow_redirects' => false])
            ->withHeaders(['Accept' => 'application/vnd.github+json', 'X-GitHub-Api-Version' => '2022-11-28']);
    }
}
