<?php

namespace Tests\Support;

use Illuminate\Support\Facades\Http;

/** A scripted GitHub for the Safe Mode ship loop. Override any answer by key; unknown calls fail the test. */
final class ShipGithub
{
    public const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    public const BASE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    public const NEWER = 'cccccccccccccccccccccccccccccccccccccccc';

    public array $answers;
    public array $calls = [];

    public static function pull(array $over = []): array
    {
        return array_replace_recursive([
            'number' => 7, 'title' => 'Add a', 'body' => 'Opened from Vibyra.', 'state' => 'open', 'draft' => false, 'merged' => false,
            'merged_at' => null, 'mergeable' => true, 'mergeable_state' => 'clean', 'node_id' => 'PR_node', 'user' => ['login' => 'octocat'],
            'html_url' => 'https://github.com/fixture/repo/pull/7',
            'head' => ['sha' => self::HEAD, 'ref' => 'vibyra/task', 'repo' => ['full_name' => 'fixture/repo']],
            'base' => ['sha' => self::BASE, 'ref' => 'main', 'repo' => ['full_name' => 'fixture/repo', 'default_branch' => 'main']],
        ], $over);
    }

    public static function run(string $name, string $status, ?string $conclusion): array
    {
        return ['name' => $name, 'status' => $status, 'conclusion' => $conclusion, 'html_url' => 'https://github.com/fixture/repo/runs/'.$name];
    }

    public static function install(array $over = []): self
    {
        $fake = new self;
        $fake->answers = $over + [
            'repo' => [200, ['default_branch' => 'main']],
            'list' => [200, [self::pull()]],
            'pull' => [200, self::pull()],
            'reviews' => [200, []],
            'runs' => [200, ['check_runs' => [self::run('ci', 'completed', 'success')]]],
            'statuses' => [200, ['state' => 'pending', 'statuses' => []]],
            'graphql' => [200, ['data' => ['repository' => ['pullRequest' => ['reviewDecision' => 'APPROVED',
                'reviewThreads' => ['nodes' => [['isResolved' => true], ['isResolved' => false]]]]]]]],
            'headRef' => [200, ['ref' => 'refs/heads/vibyra/task', 'object' => ['type' => 'commit', 'sha' => self::HEAD]]],
            'baseRef' => [200, ['ref' => 'refs/heads/main', 'object' => ['type' => 'commit', 'sha' => self::BASE]]],
            'create' => [201, self::pull(['draft' => true])],
            'merge' => [200, ['merged' => true, 'sha' => 'dddddddddddddddddddddddddddddddddddddddd']],
            'delete' => [204, []],
        ];
        // A fresh client each time: a second fake() would sit behind the first one's answers.
        Http::swap(new \Illuminate\Http\Client\Factory);
        Http::preventStrayRequests();
        Http::fake(fn ($request) => $fake->answer($request));
        return $fake;
    }

    public function answer($request)
    {
        $path = (string) parse_url($request->url(), PHP_URL_PATH);
        $method = $request->method();
        $this->calls[] = $method.' '.$path;
        $key = match (true) {
            $path === '/repos/fixture/repo' => 'repo',
            $method === 'GET' && $path === '/repos/fixture/repo/pulls' => 'list',
            $method === 'POST' && $path === '/repos/fixture/repo/pulls' => 'create',
            $method === 'PUT' && str_ends_with($path, '/merge') => 'merge',
            $method === 'GET' && str_ends_with($path, '/pulls/7') => 'pull',
            str_ends_with($path, '/reviews') => 'reviews',
            str_ends_with($path, '/check-runs') => 'runs',
            str_ends_with($path, '/status') => 'statuses',
            $path === '/graphql' => 'graphql',
            $method === 'DELETE' => 'delete',
            $method === 'GET' && str_ends_with($path, '/git/ref/heads/vibyra/task') => 'headRef',
            $method === 'GET' && str_ends_with($path, '/git/ref/heads/main') => 'baseRef',
            default => null,
        };
        if ($key === null) return Http::response(['message' => 'unexpected '.$method.' '.$path], 418);
        [$status, $body] = $this->answers[$key];
        return Http::response($body, $status);
    }

    public function wrote(): array
    {
        return array_values(array_filter($this->calls, fn ($c) => !str_starts_with($c, 'GET ') && $c !== 'POST /graphql'));
    }
}
