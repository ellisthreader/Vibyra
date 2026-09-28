<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

class ReleaseArtifactChecksum
{
    public function matches(string $path, string $expected, int $bytes): bool
    {
        $diskName = (string) config('releases.disk', 'local');
        $disk = Storage::disk($diskName);
        $modified = $disk->lastModified($path);
        $key = 'release-sha256:'.hash('sha256', implode('|', [
            $diskName, $path, $bytes, $modified, strtolower($expected),
        ]));

        return Cache::remember($key, now()->addMinutes(5), function () use ($disk, $path, $expected): bool {
            $stream = $disk->readStream($path);
            if (! is_resource($stream)) {
                throw new RuntimeException('Release artifact stream is unavailable.');
            }
            try {
                $hash = hash_init('sha256');
                hash_update_stream($hash, $stream);

                return hash_equals(strtolower($expected), hash_final($hash));
            } finally {
                fclose($stream);
            }
        });
    }
}
