<?php

namespace App\Services;

use Illuminate\Support\Facades\Storage;
use RuntimeException;

/** One configured primary and optional migration fallback, never client-selected. */
class ReleaseStorage
{
    public function diskFor(string $path): ?string
    {
        if ($path === '' || str_starts_with($path, '/') || str_contains($path, '..') || str_contains($path, '\\')) {
            return null;
        }
        $names = array_unique(array_filter([config('releases.disk', 'local'), config('releases.fallback_disk')]));
        foreach ($names as $name) {
            // A broken primary is a service error, not permission to serve stale data.
            if (Storage::disk($name)->exists($path)) {
                return $name;
            }
        }

        return null;
    }

    public function copyVerified(string $path, string $source, string $destination): array
    {
        if ($source === $destination || ! str_starts_with($path, 'releases/') || str_contains($path, '..')) {
            throw new RuntimeException('Invalid release migration.');
        }
        $from = Storage::disk($source);
        $to = Storage::disk($destination);
        $hash = $this->checksum($source, $path);
        if ($to->exists($path)) {
            if (! hash_equals($hash, $this->checksum($destination, $path))) {
                throw new RuntimeException('Destination already contains different bytes; refusing overwrite.');
            }
        } else {
            $stream = $from->readStream($path);
            if (! is_resource($stream)) {
                throw new RuntimeException('Source stream unavailable.');
            }
            try {
                if (! $to->put($path, $stream, ['visibility' => 'private'])) {
                    throw new RuntimeException('Release copy failed.');
                }
            } finally {
                fclose($stream);
            }
        }
        if ($from->size($path) !== $to->size($path) || ! hash_equals($hash, $this->checksum($destination, $path))) {
            throw new RuntimeException('Copied release failed read-back verification.');
        }

        return ['path' => $path, 'bytes' => $to->size($path), 'sha256' => $hash];
    }

    public function checksum(string $disk, string $path): string
    {
        $stream = Storage::disk($disk)->readStream($path);
        if (! is_resource($stream)) {
            throw new RuntimeException('Release stream unavailable.');
        }
        try {
            $hash = hash_init('sha256');
            hash_update_stream($hash, $stream);

            return hash_final($hash);
        } finally {
            fclose($stream);
        }
    }
}
