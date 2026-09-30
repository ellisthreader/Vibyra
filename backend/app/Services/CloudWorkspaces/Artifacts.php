<?php
namespace App\Services\CloudWorkspaces;

use Illuminate\Support\Facades\{DB, Storage};

final class Artifacts
{
    public function validate(array $files): array
    {
        abort_if(count($files) > config('cloud_workspaces.max_files'), 422, 'This project has too many files for hosted import.');
        $total = 0; $seen = []; $prefixes = [];
        foreach ($files as &$file) {
            abort_unless(is_array($file) && is_string($file['path'] ?? null), 422, 'Invalid project file.');
            $path = $file['path'];
            abort_unless(strlen($path) <= 1024 && preg_match('~^(?!/)[^\\\\\x00-\x1f\x7f]+$~u', $path) && !str_contains($path, '//') && !str_ends_with($path, '/')
                && !preg_match('~(^|/)\.\.?(/|$)~', $path), 422, 'Unsafe project path.');
            abort_if(preg_match('~(^|/)(\.env(?:\.[^/]*)?|\.ssh|\.aws|\.vibyra-agent|node_modules|vendor|\.git|\.cloud-control|\.expo|\.DS_Store|\.npmrc|\.netrc|\.pypirc)(/|$)~i', $path),
                422, 'Remove secrets and generated folders before importing.');
            // Linux may distinguish names that the return destination cannot.
            $fold = mb_strtolower($path);
            $parts = explode('/', $path);
            for ($i = 1; $i <= count($parts); $i++) {
                $original = implode('/', array_slice($parts, 0, $i)); $key = mb_strtolower($original);
                abort_if(isset($prefixes[$key]) && $prefixes[$key] !== $original, 422, 'Case-conflicting directory paths.');
                $prefixes[$key] = $original;
            }
            abort_if(isset($seen[$fold]), 422, 'Duplicate or case-conflicting project paths.'); $seen[$fold] = true;
            $bytes = is_string($file['content'] ?? null) ? base64_decode($file['content'], true) : false;
            abort_unless($bytes !== false && base64_encode($bytes) === $file['content'] && strlen($bytes) <= config('cloud_workspaces.max_file_bytes'), 422, 'Invalid or oversized project file.');
            abort_unless(is_string($file['sha256'] ?? null) && hash_equals(hash('sha256', $bytes), $file['sha256']), 422, 'Project checksum mismatch.');
            $total += strlen($bytes);
            $file = ['path' => $path, 'content' => $file['content'], 'sha256' => $file['sha256'], 'executable' => ($file['executable'] ?? false) === true];
        }
        unset($file);
        foreach (array_keys($seen) as $path) {
            $parent = dirname($path);
            while ($parent !== '.') { abort_if(isset($seen[$parent]), 422, 'A file cannot also be a parent directory.'); $parent = dirname($parent); }
        }
        abort_if($total > config('cloud_workspaces.max_project_bytes'), 422, 'Project exceeds the hosted source quota.');
        usort($files, fn ($a, $b) => strcmp($a['path'], $b['path']));
        return $files;
    }

    public function save(object $w, array $files): string
    {
        $files = $this->validate($files);
        $json = json_encode(['version' => 1, 'files' => $files], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        $hash = hash('sha256', $json); $key = $w->user_id.'/'.$w->id.'/'.$hash.'.json';
        $disk = Storage::disk(config('cloud_workspaces.disk'));
        abort_unless($disk->put($key, $json, ['visibility' => 'private']), 503, 'Project could not be saved.');
        abort_unless(hash_equals($hash, hash('sha256', $disk->get($key))), 503, 'Project backup could not be verified.');
        DB::table('cloud_checkpoints')->insertOrIgnore(['workspace_id' => $w->id, 'generation' => $w->generation,
            'hash' => $hash, 'object_key' => $key, 'bytes' => strlen($json), 'created_at' => now()]);
        return $hash;
    }

    public function read(object $w, ?string $hash = null): array
    {
        $hash ??= $w->checkpoint;
        abort_unless(is_string($hash) && preg_match('/^[a-f0-9]{64}$/', $hash), 409, 'No saved cloud checkpoint is available.');
        $record = DB::table('cloud_checkpoints')->where('workspace_id', $w->id)->where('hash', $hash)->firstOrFail();
        $bytes = Storage::disk(config('cloud_workspaces.disk'))->get($record->object_key);
        abort_unless(hash_equals($hash, hash('sha256', $bytes)), 503, 'Project backup checksum failed.');
        return json_decode($bytes, true, flags: JSON_THROW_ON_ERROR);
    }
}
