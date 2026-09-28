<?php

namespace App\Services\ChatConnectors\Connectors;

use App\Services\ChatConnectors\Connector;
use App\Services\ChatConnectors\Github\{ReadTools, PullRequests, Activity, Files, Prompt, Issues, WriteTools};
use Illuminate\Support\Facades\Http;
use RuntimeException;

/** Bounded reads and exact-approved writes; PR creation is a disabled pilot. */
class GithubConnector implements Connector
{
    private const BASE = 'https://api.github.com';
    private const REPOSITORY = '#^[\w.-]+/[\w.-]+$#';

    public function definitions(): array
    {
        $string = ['type' => 'string'];
        return [...ReadTools::definitions(), ...WriteTools::definitions(), ...array_map(fn ($tool) => ['type' => 'function', 'function' => $tool], [
            ['name' => 'github_list_repositories', 'description' => 'List the repositories this token can see, most recently updated first.',
                // An empty property list has to serialise as an object, not as a JSON array.
                'parameters' => ['type' => 'object', 'properties' => new \stdClass, 'required' => [], 'additionalProperties' => false]],
            ['name' => 'github_search_issues', 'description' => 'Search issues and pull requests. Optionally limit the search to one owner/name repository.',
                'parameters' => ['type' => 'object', 'properties' => ['query' => $string, 'repository' => $string],
                    'required' => ['query'], 'additionalProperties' => false]],
            ['name' => 'github_recent_commits', 'description' => 'Read the most recent commits on an owner/name repository, optionally on one branch.',
                'parameters' => ['type' => 'object', 'properties' => ['repository' => $string, 'branch' => $string],
                    'required' => ['repository'], 'additionalProperties' => false]],
        ])];
    }

    public function writes(): array
    {
        return WriteTools::names();
    }

    public function reads(): array
    {
        return [...ReadTools::NAMES, 'github_list_repositories', 'github_search_issues', 'github_recent_commits'];
    }

    public function validate(string $operation, array $arguments): array
    {
        if (in_array($operation, ReadTools::NAMES, true)) return ReadTools::validate($operation, $arguments);
        if (in_array($operation, WriteTools::names(), true)) return WriteTools::validate($operation, $arguments);
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
        abort(422, 'That GitHub tool is not available.');
    }

    public function run(string $operation, array $arguments, string $credential): array
    {
        if (in_array($operation, ReadTools::NAMES, true)) {
            $result = match ($operation) {
                'github_issue' => app(Issues::class)->read($arguments, $credential),
                'github_pull_request' => app(PullRequests::class)->read($arguments, $credential),
                'github_pull_request_files' => app(PullRequests::class)->files($arguments, $credential),
                'github_repository_activity' => app(Activity::class)->read($arguments, $credential),
                'github_read_file' => app(Files::class)->read($arguments, $credential),
            };
            $label = match ($operation) {
                'github_issue' => 'issue #'.$arguments['number'],
                'github_pull_request' => 'pull request #'.$arguments['number'],
                'github_pull_request_files' => 'changed files for PR #'.$arguments['number'],
                'github_repository_activity' => 'repository activity',
                'github_read_file' => 'file '.$arguments['path'],
            };
            return ['result' => $result, 'summary' => (isset($result['error']) ? 'Could not read ' : 'Read ').$label.' on '.$arguments['repository']];
        }
        if (in_array($operation, WriteTools::names(), true)) {
            return app(WriteTools::class)->run($operation, $arguments, $credential);
        }
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

    public function prompt(): string
    {
        return Prompt::text();
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

    private function unreachable(): array
    {
        return ['result' => ['error' => 'GitHub could not be reached just now. Please try again in a moment.'],
            'summary' => 'Could not reach GitHub'];
    }
}
