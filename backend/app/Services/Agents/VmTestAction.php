<?php

namespace App\Services\Agents;

/** Exact-file proposal for one POSIX shell test in the disconnected Mac VM. */
final class VmTestAction
{
    public static function definition(): array
    {
        $path = ['type' => 'string', 'maxLength' => 2048];
        return ['type' => 'function', 'function' => [
            'name' => 'run_test',
            'description' => 'Run one POSIX shell test from explicitly hashed worktree files in a disconnected Linux VM. BusyBox shell only; no Node, npm or Xcode. Requires separate Mac test access and exact approval.',
            'parameters' => ['type' => 'object', 'properties' => [
                'script' => $path,
                'files' => ['type' => 'array', 'minItems' => 1, 'maxItems' => 16,
                    'items' => ['type' => 'object', 'properties' => ['path' => $path,
                        'sha256' => ['type' => 'string', 'pattern' => '^[a-f0-9]{64}$']],
                        'required' => ['path', 'sha256'], 'additionalProperties' => false]],
                'timeoutSeconds' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 120],
            ], 'required' => ['script', 'files', 'timeoutSeconds'], 'additionalProperties' => false],
        ]];
    }

    public static function arguments(array $args): array
    {
        $keys = array_keys($args); sort($keys);
        abort_unless($keys === ['files', 'script', 'timeoutSeconds']
            && self::path($args['script'] ?? null)
            && is_int($args['timeoutSeconds'] ?? null)
            && $args['timeoutSeconds'] >= 1 && $args['timeoutSeconds'] <= 120
            && is_array($args['files'] ?? null) && array_is_list($args['files'])
            && count($args['files']) >= 1 && count($args['files']) <= 16,
            422, 'Choose one bounded shell test and its exact project files.');
        $files = [];
        foreach ($args['files'] as $file) {
            abort_unless(is_array($file) && count($file) === 2 && self::path($file['path'] ?? null)
                && is_string($file['sha256'] ?? null)
                && preg_match('/\A[a-f0-9]{64}\z/D', $file['sha256']) === 1
                && !isset($files[$file['path']]), 422, 'VM test files need distinct paths and exact SHA-256 hashes.');
            $files[$file['path']] = ['path' => $file['path'], 'sha256' => $file['sha256']];
        }
        abort_unless(array_sum(array_map('strlen', array_keys($files))) <= 3000, 422,
            'VM test file paths are too long together.');
        abort_unless(isset($files[$args['script']]), 422, 'The shell test must be one of the selected files.');
        ksort($files);
        return ['script' => $args['script'], 'files' => array_values($files),
            'timeoutSeconds' => $args['timeoutSeconds']];
    }

    public static function receipt(array $args, array $result): void
    {
        if (isset($result['error'])) {
            abort_unless(count($result) === 1 && is_string($result['error'])
                && strlen($result['error']) <= 500, 422, 'Invalid Mac test refusal.');
            return;
        }
        $keys = array_keys($result); sort($keys);
        abort_unless($keys === ['exitCode', 'files', 'output', 'script', 'snapshot', 'timedOut']
            && ($result['script'] ?? null) === $args['script']
            && ($result['files'] ?? null) === $args['files']
            && is_string($result['snapshot'] ?? null)
            && preg_match('/\A[a-f0-9]{64}\z/D', $result['snapshot']) === 1
            && is_string($result['output'] ?? null) && strlen($result['output']) <= 7000
            && is_bool($result['timedOut'] ?? null)
            && ($result['timedOut'] ? $result['exitCode'] === null
                : is_int($result['exitCode'] ?? null) && $result['exitCode'] >= 0 && $result['exitCode'] <= 255),
            422, 'The Mac test receipt does not match the approved script and file hashes.');
    }

    private static function path(mixed $path): bool
    {
        if (!is_string($path) || $path === '' || strlen($path) > 2048
            || preg_match('/\A[A-Za-z0-9._\/-]+\z/D', $path) !== 1) return false;
        foreach (explode('/', $path) as $part) {
            if ($part === '' || str_starts_with($part, '.')
                || in_array($part, ['node_modules', 'vendor', '__pycache__'], true)) return false;
        }
        return true;
    }
}
