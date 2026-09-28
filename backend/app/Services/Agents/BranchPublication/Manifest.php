<?php

namespace App\Services\Agents\BranchPublication;

/** Validates the exact Mac worktree snapshot and its upload bytes. */
final class Manifest
{
    public const MAX_FILES = 50;
    public const MAX_FILE_BYTES = 2 * 1024 * 1024;
    public const MAX_TOTAL_BYTES = 16 * 1024 * 1024;

    public static function validate(array $payload, string $workspaceId): array
    {
        self::keys($payload, ['baseSha', 'branch', 'files', 'snapshotSha256']);
        abort_unless(is_array($payload['files']), 422, 'The changed-file list is required.');
        $metadata = $payload;
        $metadata['files'] = [];
        foreach ($payload['files'] as $file) {
            abort_unless(is_array($file), 422, 'Invalid changed file.');
            self::keys($file, ['bytes', 'contentBase64', 'mode', 'path', 'previousPath', 'sha256', 'status']);
            $metadata['files'][] = array_diff_key($file, ['contentBase64' => true]);
        }
        $safe = self::metadata($metadata, $workspaceId);
        foreach ($payload['files'] as $index => $file) {
            $encoded = $file['contentBase64'];
            if ($safe['files'][$index]['sha256'] === null) {
                abort_unless($encoded === null, 422, 'A deletion cannot upload content.');
                $safe['files'][$index]['content'] = null;
                continue;
            }
            abort_unless(is_string($encoded)
                && strlen($encoded) <= 4 * (int) ceil(self::MAX_FILE_BYTES / 3),
                422, 'Invalid changed-file content.');
            $content = base64_decode($encoded, true);
            abort_unless($content !== false && base64_encode($content) === $encoded
                && strlen($content) === $safe['files'][$index]['bytes']
                && hash_equals($safe['files'][$index]['sha256'], hash('sha256', $content)),
                422, 'Changed-file bytes do not match the reviewed snapshot.');
            $safe['files'][$index]['content'] = $content;
        }
        return $safe;
    }

    public static function metadata(array $payload, string $workspaceId): array
    {
        self::keys($payload, ['baseSha', 'branch', 'files', 'snapshotSha256']);
        $base = $payload['baseSha'];
        $branch = $payload['branch'];
        $snapshot = $payload['snapshotSha256'];
        abort_unless(is_string($base) && preg_match('/\A[a-f0-9]{40}\z/D', $base),
            422, 'The publish base must be a full GitHub commit ID.');
        abort_unless($branch === 'vibyra-agent/'.$workspaceId, 422,
            'The publish branch does not belong to this computer grant.');
        abort_unless(is_string($snapshot) && preg_match('/\A[a-f0-9]{64}\z/D', $snapshot),
            422, 'The reviewed snapshot is missing.');
        $input = $payload['files'];
        abort_unless(is_array($input) && array_is_list($input) && count($input) >= 1
            && count($input) <= self::MAX_FILES, 422, 'The complete changed-file list is required.');
        $files = []; $total = 0; $previous = null;
        foreach ($input as $file) {
            abort_unless(is_array($file), 422, 'Invalid changed file.');
            self::keys($file, ['bytes', 'mode', 'path', 'previousPath', 'sha256', 'status']);
            $path = $file['path'];
            abort_unless(self::path($path) && ($previous === null || strcmp($previous, $path) < 0),
                422, 'Changed files must be safe, unique and sorted.');
            $previous = $path;
            $old = $file['previousPath'];
            abort_unless($old === null || self::path($old), 422, 'Invalid renamed path.');
            $status = $file['status'];
            abort_unless(is_string($status) && preg_match('/\A[ MADRCT?]{2}\z/D', $status),
                422, 'Invalid worktree change status.');
            $count = $file['bytes'];
            abort_unless(is_int($count) && $count >= 0 && $count <= self::MAX_FILE_BYTES,
                422, 'A changed file exceeds the publish limit.');
            $sha = $file['sha256']; $mode = $file['mode'];
            if ($sha === null) {
                abort_unless(str_contains($status, 'D') && $mode === null && $count === 0,
                    422, 'Invalid deletion in publish snapshot.');
            } else {
                abort_unless(is_string($sha) && preg_match('/\A[a-f0-9]{64}\z/D', $sha)
                    && in_array($mode, ['100644', '100755'], true),
                    422, 'Invalid changed-file metadata.');
            }
            $total += $count;
            abort_unless($total <= self::MAX_TOTAL_BYTES, 422, 'The change set exceeds the publish limit.');
            $files[] = ['path' => $path, 'status' => $status, 'previousPath' => $old,
                'sha256' => $sha, 'mode' => $mode, 'bytes' => $count];
        }
        abort_unless(hash_equals($snapshot, self::digest($base, $branch, $files)),
            409, 'The worktree changed. Review its current snapshot before publishing.');
        return ['baseSha' => $base, 'branch' => $branch, 'snapshotSha256' => $snapshot,
            'files' => $files, 'totalBytes' => $total];
    }

    public static function digest(string $base, string $branch, array $files): string
    {
        $fields = [$base, $branch, (string) count($files)];
        foreach ($files as $file) {
            foreach (['path', 'status', 'previousPath', 'sha256', 'mode'] as $key) {
                $fields[] = (string) ($file[$key] ?? '');
            }
            $fields[] = (string) $file['bytes'];
        }
        return hash('sha256', "vibyra-agent-publish-v1\0".implode("\0", $fields)."\0");
    }

    private static function path(mixed $path): bool
    {
        if (!is_string($path) || $path === '' || strlen($path) > 2048
            || str_contains($path, "\0") || str_contains($path, '\\') || str_contains($path, ':')) return false;
        foreach (explode('/', $path) as $part) {
            if ($part === '' || str_starts_with($part, '.') || in_array($part, ['node_modules', 'vendor'], true)) return false;
        }
        return true;
    }

    private static function keys(array $value, array $allowed): void
    {
        $keys = array_keys($value); sort($keys);
        abort_unless($keys === $allowed, 422, 'The publish snapshot has unexpected fields.');
    }
}
