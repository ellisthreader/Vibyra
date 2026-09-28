<?php

namespace App\Services\ChatConnectors\Github;

use Illuminate\Support\Facades\Http;

/** Exact-approved GitHub writes. PR creation stays off until publish acceptance. */
final class WriteTools
{
    private const BASE = 'https://api.github.com';
    private const REPOSITORY = '#\A[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\z#D';
    private const SHA = '/\A(?:[a-f0-9]{40}|[a-f0-9]{64})\z/D';

    public static function names(): array
    {
        return config('agents.github_pr_enabled')
            ? ['github_create_issue', 'github_create_pull_request'] : ['github_create_issue'];
    }

    public static function definitions(): array
    {
        $string = ['type' => 'string'];
        $issue = ['name' => 'github_create_issue', 'description' => 'Open a new issue on an owner/name repository. Requires exact approval.',
            'parameters' => ['type' => 'object', 'properties' => ['repository' => $string, 'title' => $string, 'body' => $string],
                'required' => ['repository', 'title'], 'additionalProperties' => false]];
        $tools = [$issue];
        if (config('agents.github_pr_enabled')) $tools[] = [
            'name' => 'github_create_pull_request',
            'description' => 'Open a PR from an already published branch in the same repository. '
                .'Requires exact approval of repository, branches, head/base commit IDs, title, body and draft state. '
                .'A changed branch is refused; an unconfirmed POST is never retried automatically.',
            'parameters' => ['type' => 'object', 'properties' => [
                'repository' => $string, 'head' => $string, 'base' => $string,
                'expectedHeadSha' => $string, 'expectedBaseSha' => $string,
                'title' => $string, 'body' => $string, 'draft' => ['type' => 'boolean'],
            ], 'required' => ['repository', 'head', 'base', 'expectedHeadSha', 'expectedBaseSha', 'title', 'draft'],
                'additionalProperties' => false],
        ];
        return array_map(fn ($tool) => ['type' => 'function', 'function' => $tool], $tools);
    }

    public static function validate(string $operation, array $args): array
    {
        abort_unless(in_array($operation, self::names(), true), 422, 'That GitHub write is not enabled.');
        $repository = $args['repository'] ?? null;
        abort_unless(is_string($repository) && preg_match(self::REPOSITORY, $repository)
            && count(array_intersect(explode('/', $repository), ['.', '..'])) === 0, 422,
            'A repository has to be written as owner/name.');
        if ($operation === 'github_create_issue') {
            $title = $args['title'] ?? null;
            abort_unless(is_string($title) && trim($title) !== '' && strlen($title) <= 250,
                422, 'Say what the issue is, in 250 characters or fewer.');
            $body = $args['body'] ?? null;
            abort_unless($body === null || (is_string($body) && strlen($body) <= 8000),
                422, 'That issue body is too long.');
            return array_filter(array_intersect_key($args, array_flip(['repository', 'title', 'body'])),
                fn ($value) => is_string($value) && trim($value) !== '');
        }
        $keys = array_keys($args); sort($keys);
        $allowed = ['base', 'body', 'draft', 'expectedBaseSha', 'expectedHeadSha', 'head', 'repository', 'title'];
        abort_unless($keys === $allowed || $keys === array_values(array_diff($allowed, ['body'])),
            422, 'Choose one exact PR action.');
        foreach (['head', 'base'] as $field) {
            abort_unless(self::branch($args[$field] ?? null), 422, 'Choose a valid same-repository branch.');
        }
        abort_unless($args['head'] !== $args['base'], 422, 'A PR needs distinct head and base branches.');
        foreach (['expectedHeadSha', 'expectedBaseSha'] as $field) {
            abort_unless(is_string($args[$field] ?? null) && preg_match(self::SHA, $args[$field]),
                422, 'Pin both branch commit IDs before requesting a PR.');
        }
        $title = $args['title'] ?? null;
        abort_unless(is_string($title) && trim($title) !== '' && strlen($title) <= 250
            && is_bool($args['draft'] ?? null), 422, 'Choose a PR title and draft state.');
        $body = $args['body'] ?? null;
        abort_unless($body === null || (is_string($body) && strlen($body) <= 8000),
            422, 'That PR body is too long.');
        return ['repository' => $repository, 'head' => $args['head'], 'base' => $args['base'],
            'expectedHeadSha' => $args['expectedHeadSha'], 'expectedBaseSha' => $args['expectedBaseSha'],
            'title' => trim($title), 'body' => $body === null ? '' : trim($body), 'draft' => $args['draft']];
    }

    public function run(string $operation, array $args, string $token): array
    {
        abort_unless(in_array($operation, self::names(), true), 422, 'That GitHub write is not enabled.');
        return $operation === 'github_create_issue'
            ? $this->createIssue($args, $token) : $this->createPullRequest($args, $token);
    }

    private function createIssue(array $args, string $token): array
    {
        try {
            $response = $this->request($token)->post(self::BASE.Client::path($args['repository']).'/issues',
                ['title' => trim($args['title'])] + (isset($args['body']) ? ['body' => trim($args['body'])] : []));
            $issue = $response->successful() ? $response->json() : null;
        } catch (\Throwable) { $issue = null; }
        if (!is_array($issue)) return ['result' => ['error' => 'GitHub did not confirm opening that issue. Check the repository before retrying.'],
            'summary' => 'Could not confirm an issue on '.$args['repository']];
        return ['result' => ['opened' => true, 'number' => (int) ($issue['number'] ?? 0),
            'title' => (string) ($issue['title'] ?? ''), 'url' => $issue['html_url'] ?? null],
            'summary' => 'Opened issue #'.($issue['number'] ?? '?').' on '.$args['repository']];
    }

    private function createPullRequest(array $args, string $token): array
    {
        $repo = Client::path($args['repository']);
        foreach (['head' => 'expectedHeadSha', 'base' => 'expectedBaseSha'] as $branch => $sha) {
            $ref = implode('/', array_map('rawurlencode', explode('/', $args[$branch])));
            try {
                $response = $this->request($token)->get(self::BASE.$repo.'/git/ref/heads/'.$ref);
                $data = $response->successful() ? $response->json() : null;
            } catch (\Throwable) { $data = null; }
            if (!is_array($data) || ($data['ref'] ?? null) !== 'refs/heads/'.$args[$branch]
                || ($data['object']['type'] ?? null) !== 'commit'
                || ($data['object']['sha'] ?? null) !== $args[$sha]) {
                return ['result' => ['opened' => false, 'refused' => true,
                    'reason' => 'The approved '.$branch.' branch commit could not be verified. Review and approve a fresh PR action.'],
                    'summary' => 'Did not open a PR on '.$args['repository']];
            }
        }
        $payload = ['title' => $args['title'], 'head' => $args['head'], 'base' => $args['base'],
            'body' => $args['body'], 'draft' => $args['draft']];
        try {
            $response = $this->request($token)->post(self::BASE.$repo.'/pulls', $payload);
        } catch (\Throwable) { return $this->unknown($args, null); }
        if (in_array($response->status(), [403, 404, 422], true)) {
            return ['result' => ['opened' => false, 'refused' => true,
                'reason' => 'GitHub refused this PR. Check branch access or whether one already exists.'],
                'summary' => 'Did not open a PR on '.$args['repository']];
        }
        $pr = $response->status() === 201 ? $response->json() : null;
        if (!$this->confirmedPr($pr, $args)) {
            return $this->unknown($args, is_array($pr) ? ($pr['html_url'] ?? null) : null);
        }
        return ['result' => ['opened' => true, 'number' => $pr['number'],
            'url' => $pr['html_url'] ?? null, 'headSha' => $args['expectedHeadSha'],
            'baseSha' => $args['expectedBaseSha'], 'draft' => $args['draft']],
            'summary' => 'Opened PR #'.$pr['number'].' on '.$args['repository']];
    }

    private function confirmedPr(mixed $pr, array $args): bool
    {
        if (!is_array($pr) || !is_int($pr['number'] ?? null) || $pr['number'] < 1) return false;
        if (($pr['head']['sha'] ?? null) !== $args['expectedHeadSha']
            || ($pr['base']['sha'] ?? null) !== $args['expectedBaseSha']
            || ($pr['head']['ref'] ?? null) !== $args['head']
            || ($pr['base']['ref'] ?? null) !== $args['base']
            || strcasecmp((string) ($pr['head']['repo']['full_name'] ?? ''), $args['repository']) !== 0
            || strcasecmp((string) ($pr['base']['repo']['full_name'] ?? ''), $args['repository']) !== 0
            || ($pr['title'] ?? null) !== $args['title']
            || ($pr['body'] ?? null) !== $args['body']
            || ($pr['draft'] ?? null) !== $args['draft']) return false;
        return is_string($pr['html_url'] ?? null) && strcasecmp($pr['html_url'],
            'https://github.com/'.$args['repository'].'/pull/'.$pr['number']) === 0;
    }

    private function unknown(array $args, ?string $url): array
    {
        return ['result' => ['error' => 'GitHub did not confirm the exact approved PR outcome. Inspect the repository before any retry.',
            'url' => is_string($url) && str_starts_with($url, 'https://github.com/') ? $url : null],
            'summary' => 'PR outcome unconfirmed on '.$args['repository']];
    }

    private function request(string $token): \Illuminate\Http\Client\PendingRequest
    {
        return Http::withToken($token)->acceptJson()->timeout((int) config('chat_connectors.timeout_seconds', 12))
            ->withOptions(['allow_redirects' => false])
            ->withHeaders(['Accept' => 'application/vnd.github+json', 'X-GitHub-Api-Version' => '2022-11-28']);
    }

    private static function branch(mixed $branch): bool
    {
        if (!is_string($branch) || strlen($branch) > 100
            || !preg_match('#\A[A-Za-z0-9][A-Za-z0-9._/-]*\z#D', $branch)
            || str_contains($branch, '..') || str_contains($branch, '//')
            || str_ends_with($branch, '/') || str_ends_with($branch, '.')) return false;
        foreach (explode('/', $branch) as $part) {
            if (str_starts_with($part, '.') || str_ends_with($part, '.lock')) return false;
        }
        return true;
    }
}
