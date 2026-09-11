<?php

namespace App\Services\ChatConnectors\Connectors;

use App\Services\ChatConnectors\Connector;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Reading is most of what this does; the one thing it may change is that an issue
 * now exists. It cannot close, edit, comment on or delete anything already there,
 * and it never touches code — a reply that could push a commit or close someone's
 * bug is a reply nobody would let near a real repository, and `writes` in the
 * catalogue says exactly that.
 */
class GithubConnector implements Connector
{
    private const BASE = 'https://api.github.com';
    private const REPOSITORY = '#^[\w.-]+/[\w.-]+$#';

    public function definitions(): array
    {
        $string = ['type' => 'string'];
        return array_map(fn ($tool) => ['type' => 'function', 'function' => $tool], [
            ['name' => 'github_list_repositories', 'description' => 'List the repositories this token can see, most recently updated first.',
                // An empty property list has to serialise as an object, not as a JSON array.
                'parameters' => ['type' => 'object', 'properties' => new \stdClass, 'required' => [], 'additionalProperties' => false]],
            ['name' => 'github_search_issues', 'description' => 'Search issues and pull requests. Optionally limit the search to one owner/name repository.',
                'parameters' => ['type' => 'object', 'properties' => ['query' => $string, 'repository' => $string],
                    'required' => ['query'], 'additionalProperties' => false]],
            ['name' => 'github_recent_commits', 'description' => 'Read the most recent commits on an owner/name repository, optionally on one branch.',
                'parameters' => ['type' => 'object', 'properties' => ['repository' => $string, 'branch' => $string],
                    'required' => ['repository'], 'additionalProperties' => false]],
            ['name' => 'github_create_issue', 'description' => 'Open a new issue on an owner/name repository. This is the only thing that changes anything: it cannot close, edit or comment on an existing issue.',
                'parameters' => ['type' => 'object', 'properties' => ['repository' => $string, 'title' => $string, 'body' => $string],
                    'required' => ['repository', 'title'], 'additionalProperties' => false]],
        ]);
    }

    public function writes(): array
    {
        return ['github_create_issue'];
    }

    public function validate(string $operation, array $arguments): array
    {
        if ($operation === 'github_list_repositories') return [];
        $repository = $arguments['repository'] ?? null;
        if ($operation === 'github_search_issues') {
            abort_unless(is_string($arguments['query'] ?? null) && trim($arguments['query']) !== ''
                && strlen($arguments['query']) <= 200, 422, 'Say what to search GitHub for, in 200 characters or fewer.');
            abort_unless($repository === null || (is_string($repository) && preg_match(self::REPOSITORY, $repository)),
                422, 'A repository has to be written as owner/name.');
            return array_intersect_key($arguments, array_flip(['query', 'repository']));
        }
        if ($operation === 'github_recent_commits') {
            abort_unless(is_string($repository) && preg_match(self::REPOSITORY, $repository), 422, 'A repository has to be written as owner/name.');
            $branch = $arguments['branch'] ?? null;
            abort_unless($branch === null || (is_string($branch) && strlen($branch) <= 100), 422, 'That branch name is too long.');
            return array_intersect_key($arguments, array_flip(['repository', 'branch']));
        }
        if ($operation === 'github_create_issue') {
            abort_unless(is_string($repository) && preg_match(self::REPOSITORY, $repository), 422, 'A repository has to be written as owner/name.');
            $title = $arguments['title'] ?? null;
            abort_unless(is_string($title) && trim($title) !== '' && strlen($title) <= 250,
                422, 'Say what the issue is, in 250 characters or fewer.');
            $body = $arguments['body'] ?? null;
            abort_unless($body === null || (is_string($body) && strlen($body) <= 8000), 422, 'That issue body is too long.');
            return array_filter(array_intersect_key($arguments, array_flip(['repository', 'title', 'body'])),
                fn ($value) => is_string($value) && trim($value) !== '');
        }
        abort(422, 'That GitHub tool is not available.');
    }

    public function run(string $operation, array $arguments, string $credential): array
    {
        if ($operation === 'github_list_repositories') {
            $body = $this->get($credential, '/user/repos', ['per_page' => 20, 'sort' => 'updated']);
            if ($body === null) return $this->unreachable();
            $repositories = array_map(fn ($repo) => [
                'fullName' => (string) ($repo['full_name'] ?? ''), 'description' => $repo['description'] ?? null,
                'language' => $repo['language'] ?? null, 'private' => (bool) ($repo['private'] ?? false),
                'openIssues' => (int) ($repo['open_issues_count'] ?? 0), 'updatedAt' => $repo['updated_at'] ?? null,
            ], array_slice($body, 0, 20));
            return ['result' => ['repositories' => $repositories],
                'summary' => 'Listed '.count($repositories).' repositories from GitHub'];
        }
        if ($operation === 'github_search_issues') {
            $query = $arguments['query'];
            $search = empty($arguments['repository']) ? $query : $query.' repo:'.$arguments['repository'];
            $body = $this->get($credential, '/search/issues', ['q' => $search, 'per_page' => 20]);
            if ($body === null) return $this->unreachable();
            $issues = array_map(fn ($item) => [
                'number' => (int) ($item['number'] ?? 0), 'title' => (string) ($item['title'] ?? ''),
                'state' => $item['state'] ?? null, 'url' => $item['html_url'] ?? null,
                'updatedAt' => $item['updated_at'] ?? null, 'isPullRequest' => isset($item['pull_request']),
                // The search API names the repository only as an API URL, whose tail is owner/name.
                'repository' => implode('/', array_slice(explode('/', (string) ($item['repository_url'] ?? '')), -2)),
            ], array_slice($body['items'] ?? [], 0, 20));
            return ['result' => ['issues' => $issues], 'summary' => 'Searched GitHub for "'.$query.'"'];
        }
        if ($operation === 'github_recent_commits') {
            $repository = $arguments['repository'];
            $query = ['per_page' => 15] + (empty($arguments['branch']) ? [] : ['sha' => $arguments['branch']]);
            $body = $this->get($credential, '/repos/'.$repository.'/commits', $query);
            if ($body === null) return $this->unreachable();
            $commits = array_map(fn ($commit) => [
                'sha' => substr((string) ($commit['sha'] ?? ''), 0, 7),
                'message' => explode("\n", trim((string) ($commit['commit']['message'] ?? '')))[0],
                'author' => $commit['commit']['author']['name'] ?? null,
                'date' => $commit['commit']['author']['date'] ?? null,
            ], array_slice($body, 0, 15));
            return ['result' => ['commits' => $commits], 'summary' => 'Read the latest commits on '.$repository];
        }
        if ($operation === 'github_create_issue') {
            $repository = $arguments['repository'];
            $issue = $this->post($credential, '/repos/'.$repository.'/issues',
                ['title' => trim($arguments['title'])] + (isset($arguments['body']) ? ['body' => trim($arguments['body'])] : []));
            // A token with read-only Issues access is the common case here, and the
            // difference between "GitHub is down" and "this key may not write" is
            // the difference between trying again and going to fix the token.
            if ($issue === null) {
                return ['result' => ['error' => 'GitHub did not open that issue. The token may be read-only, or may not reach '
                    .$repository.'.'], 'summary' => 'Could not open an issue on '.$repository];
            }
            return ['result' => ['opened' => true, 'number' => (int) ($issue['number'] ?? 0),
                'title' => (string) ($issue['title'] ?? ''), 'url' => $issue['html_url'] ?? null],
                'summary' => 'Opened issue #'.($issue['number'] ?? '?').' on '.$repository];
        }
        return $this->unreachable();
    }

    public function connect(string $credential): string
    {
        $body = $this->get($credential, '/user');
        if (!is_string($body['login'] ?? null)) {
            throw new RuntimeException('That token did not work. Check it has not expired and try again.');
        }
        return '@'.$body['login'];
    }

    private function request(string $credential)
    {
        return Http::withToken($credential)->acceptJson()
            ->timeout((int) config('chat_connectors.timeout_seconds', 12))
            ->withHeaders(['Accept' => 'application/vnd.github+json', 'X-GitHub-Api-Version' => '2022-11-28']);
    }

    /** The decoded body, or null when GitHub refused or could not be reached. */
    private function get(string $credential, string $path, array $query = []): ?array
    {
        $response = $this->request($credential)->get(self::BASE.$path, $query);
        if (!$response->successful()) return null;
        $body = $response->json();
        return is_array($body) ? $body : null;
    }

    /** The created resource, or null when GitHub refused or could not be reached. */
    private function post(string $credential, string $path, array $payload): ?array
    {
        $response = $this->request($credential)->post(self::BASE.$path, $payload);
        if (!$response->successful()) return null;
        $body = $response->json();
        return is_array($body) ? $body : null;
    }

    private function unreachable(): array
    {
        return ['result' => ['error' => 'GitHub could not be reached just now. Please try again in a moment.'],
            'summary' => 'Could not reach GitHub'];
    }
}
