<?php

namespace App\Services\ChatConnectors\Github;

final class Activity
{
    public function __construct(private readonly Client $client) {}

    public function read(array $a, string $token): array
    {
        $query = ['since' => $a['since'].'T00:00:00Z', 'until' => $a['until'].'T23:59:59Z', 'per_page' => 30, 'page' => $a['page']];
        if (isset($a['branch'])) $query['sha'] = $a['branch'];
        $commits = $this->client->get($token, Client::path($a['repository']).'/commits', $query);
        $prs = $this->client->get($token, '/search/issues', ['q' => 'repo:'.$a['repository'].' is:pr is:merged merged:'.$a['since'].'..'.$a['until'],
            'per_page' => 30, 'page' => $a['page'], 'sort' => 'updated', 'order' => 'desc']);
        return ['repository' => $a['repository'], 'since' => $a['since'], 'until' => $a['until'], 'timezone' => 'UTC',
            'branch' => $a['branch'] ?? 'default branch',
            'commits' => isset($commits['error']) ? $commits : ['items' => array_map(fn ($x) => [
                'sha' => $x['sha'] ?? null, 'message' => Client::clip($x['commit']['message'] ?? null, 600),
                'author' => $x['commit']['author']['name'] ?? null, 'date' => $x['commit']['committer']['date'] ?? null,
                'url' => $x['html_url'] ?? null,
            ], array_slice($commits['data'], 0, 30)), 'hasMore' => $commits['hasMore']],
            'mergedPullRequests' => isset($prs['error']) ? $prs : ['items' => array_map(fn ($x) => [
                'number' => $x['number'] ?? null, 'title' => $x['title'] ?? null, 'body' => Client::clip($x['body'] ?? null, 600),
                'author' => $x['user']['login'] ?? null, 'url' => $x['html_url'] ?? null,
                'mergedAt' => $x['pull_request']['merged_at'] ?? null,
            ], array_slice($prs['data']['items'] ?? [], 0, 30)), 'total' => $prs['data']['total_count'] ?? null,
                'incomplete' => $prs['data']['incomplete_results'] ?? false, 'hasMore' => $prs['hasMore']],
            'page' => $a['page'], 'nextPage' => ($commits['hasMore'] ?? false) || ($prs['hasMore'] ?? false) ? $a['page'] + 1 : null,
            'coverage' => '30 commits and 30 merged PRs per page. Commits cover the selected/default branch; merged PRs cover all base branches. Search may be incomplete and is capped at 1000 results. Do not equate merged work with deployed work or double-count commits also in PRs.'];
    }
}
