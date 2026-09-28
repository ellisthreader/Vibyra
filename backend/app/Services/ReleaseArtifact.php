<?php

namespace App\Services;

use Illuminate\Support\Facades\Storage;

/**
 * Decides whether a configured release is safe to hand to a user.
 *
 * Shared by the download page and the desktop update feed so there is one
 * answer to "is this artifact real and intact". The update feed in particular
 * must not advertise a version whose file is missing or half-uploaded: the
 * desktop app would replace a working install with a failed download.
 */
class ReleaseArtifact
{
    /** Configured metadata is complete, self-consistent and correctly typed. */
    public function ready(string $platform, array $release): bool
    {
        $strict = str_starts_with($platform, 'macos-')
            || (bool) ($release['require_complete_metadata'] ?? false);
        if (! $strict) {
            return true;
        }

        foreach (['version', 'path', 'filename', 'sha256'] as $key) {
            if (trim((string) ($release[$key] ?? '')) === '') {
                return false;
            }
        }

        $checksum = (string) $release['sha256'];
        $extension = strtolower((string) ($release['expected_extension'] ?? ''));
        $pathExtension = strtolower((string) pathinfo((string) $release['path'], PATHINFO_EXTENSION));
        $filenameExtension = strtolower((string) pathinfo((string) $release['filename'], PATHINFO_EXTENSION));

        if (preg_match('/\A[a-f0-9]{64}\z/i', $checksum) !== 1) {
            return false;
        }

        if ((int) ($release['size_bytes'] ?? 0) <= 0 || $extension === ''
            || $pathExtension !== $extension || $filenameExtension !== $extension) {
            return false;
        }

        if (! str_starts_with($platform, 'macos-')) {
            return true;
        }

        return in_array((string) ($release['architecture'] ?? ''), ['arm64', 'x64'], true)
            && (string) ($release['minimum_system_version'] ?? '') === '12.0';
    }

    /** Byte size of the stored artifact, or null when it fails any check. */
    public function size(string $platform, array $release): ?int
    {
        if (! $this->ready($platform, $release)) {
            return null;
        }

        $disk = Storage::disk((string) config('releases.disk', 'local'));
        $path = trim((string) ($release['path'] ?? ''));
        if ($path === '' || ! $disk->exists($path)) {
            return null;
        }

        $actualSize = (int) $disk->size($path);
        $expectedSize = (int) ($release['size_bytes'] ?? 0);
        $strict = str_starts_with($platform, 'macos-')
            || (bool) ($release['require_complete_metadata'] ?? false);
        if ($actualSize <= 0 || ($strict && $actualSize !== $expectedSize)) {
            return null;
        }
        if ($strict && ! app(ReleaseArtifactChecksum::class)->matches(
            $path,
            (string) $release['sha256'],
            $actualSize,
        )) {
            return null;
        }

        return $actualSize;
    }
}
