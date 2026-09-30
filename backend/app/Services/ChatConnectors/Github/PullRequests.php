<?php

namespace App\Services\ChatConnectors\Github;

final class PullRequests
{
    public function __construct(private readonly Client $client) {}

    public function read(array $a, string $token): array
    {
        $base = Client::path($a['repository']);
        $r = $this->client->get($token, $base.'/pulls/'.$a['number']);
        if (isset($r['error'])) return $r;
        $p = $r['data']; $head = $p['head']['sha'] ?? '';
        $result = array_intersect_key($p, array_flip(['number', 'title', 'state', 'draft', 'merged', 'merged_at', 'mergeable',
            'mergeable_state', 'additions', 'deletions', 'changed_files', 'commits', 'html_url', 'updated_at']));
        $result += ['body' => Client::clip($p['body'] ?? null, 4000), 'bodyTruncated' => strlen($p['body'] ?? '') > 4000,
            'author' => $p['user']['login'] ?? null, 'headSha' => $head, 'baseSha' => $p['base']['sha'] ?? null,
            'headRepository' => $p['head']['repo']['full_name'] ?? null];
        $reviews = $this->client->get($token, $base.'/pulls/'.$a['number'].'/reviews', ['per_page' => 30]);
        $result['reviews'] = isset($reviews['error']) ? $reviews : ['items' => array_map(fn ($x) => [
            'author' => $x['user']['login'] ?? null, 'state' => $x['state'] ?? null, 'body' => Client::clip($x['body'] ?? null, 500),
            'url' => $x['html_url'] ?? null, 'commitSha' => $x['commit_id'] ?? null,
        ], array_slice($reviews['data'], 0, 30)), 'hasMore' => $reviews['hasMore']];
        if ($head !== '') {
            $checks = $this->client->get($token, $base.'/commits/'.rawurlencode($head).'/check-runs', ['per_page' => 30]);
            $result['checks'] = isset($checks['error']) ? $checks : ['items' => array_map(fn ($x) => [
                'name' => $x['name'] ?? null, 'status' => $x['status'] ?? null, 'conclusion' => $x['conclusion'] ?? null,
                'url' => $x['html_url'] ?? null,
            ], array_slice($checks['data']['check_runs'] ?? [], 0, 30)), 'hasMore' => $checks['hasMore']];
            $status = $this->client->get($token, $base.'/commits/'.rawurlencode($head).'/status', ['per_page' => 30]);
            $result['statuses'] = isset($status['error']) ? $status : ['state' => $status['data']['state'] ?? null,
                'items' => array_map(fn ($x) => array_intersect_key($x, array_flip(['context', 'state', 'description', 'target_url'])),
                    array_slice($status['data']['statuses'] ?? [], 0, 30)), 'hasMore' => $status['hasMore']];
        }
        $result['coverage'] = 'Metadata and up to 30 reviews/checks/statuses; read file patches before reviewing code. CI is not proof of test coverage. Reviews may concern an older commit.';
        return $result;
    }

    public function files(array $a, string $token): array
    {
        $r = $this->client->get($token, Client::path($a['repository']).'/pulls/'.$a['number'].'/files', ['per_page' => 10, 'page' => $a['page']]);
        if (isset($r['error'])) return $r;
        return ['files' => array_map(fn ($x) => [
            'path' => $x['filename'] ?? null, 'previousPath' => $x['previous_filename'] ?? null, 'status' => $x['status'] ?? null,
            'additions' => $x['additions'] ?? 0, 'deletions' => $x['deletions'] ?? 0, 'url' => $x['blob_url'] ?? null,
            'patch' => Client::clip($x['patch'] ?? null, 2400), 'patchMissing' => !isset($x['patch']),
            'patchTruncated' => strlen($x['patch'] ?? '') > 2400,
        ], array_slice($r['data'], 0, 10)), 'page' => $a['page'], 'nextPage' => $r['hasMore'] ? $a['page'] + 1 : null,
            'coverage' => 'Up to 10 files per page; patches may be absent for binary/large files. Read source at the PR head/base SHA for omitted context. GitHub caps PR files at 3000.'];
    }
}
