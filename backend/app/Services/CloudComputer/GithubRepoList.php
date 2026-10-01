<?php
namespace App\Services\CloudComputer;

use App\Services\CloudWorkspaces\Git\{GitRefused, Repos};
use Illuminate\Support\Facades\Http;

/** The owner's GitHub repositories for the phone's project picker. Never returns or logs the token. */
final class GithubRepoList
{
    public const MAX = 30;

    public function __construct(private readonly Repos $repos) {}

    /** @return list<array{fullName:string, private:bool, defaultBranch:string, description:?string}> */
    public function list(int $user, string $q = ''): array
    {
        $token = $this->repos->token($user); // GitRefused 409 github_not_connected
        $q = mb_strtolower(trim($q));
        $out = [];
        for ($page = 1; $page <= 3 && count($out) < self::MAX; $page++) {
            try {
                $r = Http::withToken($token)->acceptJson()->timeout(10)->withOptions(['allow_redirects' => false])
                    ->withHeaders(['Accept' => 'application/vnd.github+json', 'X-GitHub-Api-Version' => '2022-11-28'])
                    ->get('https://api.github.com/user/repos', ['per_page' => 100, 'page' => $page, 'sort' => 'pushed',
                        'affiliation' => 'owner,collaborator,organization_member']);
            } catch (\Throwable) { throw new GitRefused('github_unavailable', 'GitHub did not respond. Try again.', 503); }
            if ($r->status() === 401) throw new GitRefused('github_reconnect', 'GitHub access expired. Reconnect GitHub in Settings.', 409);
            $rows = $r->json();
            if (!$r->successful() || !is_array($rows)) throw new GitRefused('github_unavailable', 'GitHub could not list repositories.', 503);
            foreach ($rows as $row) {
                $name = $row['full_name'] ?? null;
                if (!is_string($name) || !preg_match('~^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$~', $name) || !is_string($row['default_branch'] ?? null)) continue;
                if ($q !== '' && !str_contains(mb_strtolower($name), $q)) continue;
                $out[] = ['fullName' => $name, 'private' => (bool) ($row['private'] ?? false), 'defaultBranch' => $row['default_branch'],
                    'description' => is_string($row['description'] ?? null) ? mb_substr($row['description'], 0, 200) : null];
                if (count($out) >= self::MAX) break;
            }
            if (count($rows) < 100) break;
        }
        return $out;
    }
}
