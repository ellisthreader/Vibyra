<?php

namespace App\Services\ChatConnectors\Github;

final class ReadTools
{
    public const NAMES = ['github_pull_request', 'github_pull_request_files', 'github_repository_activity', 'github_read_file'];

    public static function definitions(): array
    {
        $string = ['type' => 'string'];
        $repo = ['repository' => ['type' => 'string', 'description' => 'Exact owner/name; ask the user if ambiguous.']];
        $page = ['page' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 100]];
        $pr = $repo + ['number' => ['type' => 'integer', 'minimum' => 1]];
        $items = [
            ['github_pull_request', 'Read PR description, immutable head/base SHAs, review decisions and CI evidence. Then read changed-file patches to assess risks and tests. Never infer test coverage from a green status alone.', $pr, ['repository', 'number']],
            ['github_pull_request_files', 'Read a page of changed files and bounded patches. Follow nextPage when present; patchMissing or patchTruncated means incomplete evidence.', $pr + $page, ['repository', 'number']],
            ['github_repository_activity', 'Read commits on the selected/default branch and merged PRs in an inclusive UTC date window. Defaults to the last 7 days. Follow nextPage; commits and merged PRs are distinct, not proof of deployment.', $repo + $page + ['since' => $string, 'until' => $string, 'branch' => $string], ['repository']],
            ['github_read_file', 'Read a source/test file or list a directory at an explicit PR head/base SHA or branch. Use startLine to continue bounded text. No execution. Never request secrets.', $repo + ['path' => $string, 'ref' => $string, 'startLine' => ['type' => 'integer', 'minimum' => 1]], ['repository', 'path', 'ref']],
        ];
        return array_map(fn ($t) => ['type' => 'function', 'function' => ['name' => $t[0], 'description' => $t[1],
            'parameters' => ['type' => 'object', 'properties' => $t[2], 'required' => $t[3], 'additionalProperties' => false]]], $items);
    }

    public static function validate(string $operation, array $args): array
    {
        abort_unless(is_string($args['repository'] ?? null) && preg_match('#^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$#D', $args['repository'])
            && !in_array(explode('/', $args['repository'])[1], ['.', '..']), 422, 'Use an owner/name repository.');
        $safe = ['repository' => $args['repository']];
        if (str_starts_with($operation, 'github_pull_request')) {
            abort_unless(is_int($args['number'] ?? null) && $args['number'] > 0, 422, 'Choose a pull request number.');
            $safe['number'] = $args['number'];
        }
        if (in_array($operation, ['github_pull_request_files', 'github_repository_activity'])) {
            $page = $args['page'] ?? 1;
            abort_unless(is_int($page) && $page >= 1 && $page <= 100, 422, 'Page must be between 1 and 100.');
            $safe['page'] = $page;
        }
        if ($operation === 'github_repository_activity') {
            foreach (['since' => now()->utc()->subDays(6)->toDateString(), 'until' => now()->utc()->toDateString()] as $key => $default) {
                $date = $args[$key] ?? $default;
                abort_unless(is_string($date) && preg_match('/^\d{4}-\d{2}-\d{2}$/D', $date)
                    && strtotime($date) !== false && date('Y-m-d', strtotime($date)) === $date, 422, 'Use valid YYYY-MM-DD dates.');
                $safe[$key] = $date;
            }
            abort_unless($safe['since'] <= $safe['until'] && strtotime($safe['until']) - strtotime($safe['since']) <= 90 * 86400,
                422, 'Choose a date window of at most 90 days.');
        }
        foreach (['branch', 'ref'] as $key) if (isset($args[$key])) {
            abort_unless(is_string($args[$key]) && strlen($args[$key]) > 0 && strlen($args[$key]) <= 200, 422, 'Choose a valid Git reference.');
            $safe[$key] = $args[$key];
        }
        if ($operation === 'github_read_file') {
            $path = $args['path'] ?? null;
            abort_unless(is_string($path) && strlen($path) <= 500 && !preg_match('#(^/|\\\\|[\x00-\x1f]|(^|/)\.\.(/|$))#', $path)
                && !preg_match('#(^|/)(\.env[^/]*|\.git|node_modules|vendor|[^/]*\.(pem|key|p12))(/|$)#i', $path)
                && isset($safe['ref']), 422, 'Choose a source or test path and an explicit Git reference.');
            $line = $args['startLine'] ?? 1;
            abort_unless(is_int($line) && $line > 0 && $line <= 100000, 422, 'Choose a valid start line.');
            $safe += ['path' => $path, 'startLine' => $line];
        }
        return $safe;
    }
}
