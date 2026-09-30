<?php

namespace App\Services;

/**
 * Resolves which artifact a platform serves to which audience.
 *
 * On Windows and Linux there is one file: the NSIS installer and the AppImage
 * are both what a browser downloads and what the in-app updater swallows. macOS
 * is the exception — a human wants a `.dmg`, and Tauri's updater will only
 * accept the signed `.app.tar.gz` the bundler emits beside it. Pointing one
 * config entry at both was the bug: whichever audience you configured for, the
 * other silently got nothing (`ready()` rejects the extension mismatch, and the
 * feed answers 204 forever).
 *
 * So a platform may carry an optional `updater` overlay. Absent, the updater
 * and the download page share one artifact, exactly as before. Present, it
 * replaces only the fields that differ; `architecture`, `label` and
 * `minimum_system_version` still come from the base entry, because
 * {@see ReleaseArtifact::ready()} insists on them for macOS.
 */
class ReleaseChannel
{
    /** The artifact a browser downloads. */
    public static function download(string $platform): array
    {
        $release = (array) config("releases.platforms.{$platform}", []);
        unset($release['updater']);

        return $release;
    }

    /** The artifact the installed app replaces itself with. */
    public static function updater(string $platform): array
    {
        $base = (array) config("releases.platforms.{$platform}", []);
        if ($base === []) {
            return [];
        }

        $overlay = self::overlay($base);
        unset($base['updater']);

        return $overlay === [] ? $base : array_replace($base, $overlay);
    }

    /**
     * Whether this platform's update is a different file from its download, and
     * therefore needs its own URL rather than `/downloads/{platform}`.
     */
    public static function hasSeparateUpdateArtifact(string $platform): bool
    {
        $base = (array) config("releases.platforms.{$platform}", []);

        return trim((string) (self::overlay($base)['path'] ?? '')) !== '';
    }

    /**
     * Unset env vars arrive as `''` and `0`, and those must fall through to the
     * base entry rather than blank it out — a half-filled overlay has to read as
     * "not configured", not as "configured with nothing".
     */
    private static function overlay(array $base): array
    {
        return array_filter(
            (array) ($base['updater'] ?? []),
            static fn ($value) => $value !== '' && $value !== null && $value !== 0,
        );
    }
}
