<?php

namespace App\Http\Controllers;

use App\Services\ReleaseArtifact;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Throwable;

/**
 * The feed the installed desktop app polls to learn a new build exists.
 *
 * Speaks Tauri's dynamic updater format: `204 No Content` means "you are up to
 * date" (the common answer), `200` carries the version, the download URL and
 * the minisign signature the app verifies before it replaces itself.
 *
 * Every field is per-bundle, not per-OS, because a .deb and an AppImage of the
 * same release are different files with different signatures — and the two can
 * legitimately sit at different versions.
 */
class ReleaseUpdateController extends Controller
{
    /** `{{target}}-{{arch}}-{{bundle_type}}` as Tauri sends it → config key. */
    private const PLATFORM_MAP = [
        'linux-x86_64-appimage' => 'linux',
        'linux-x86_64-deb' => 'linux-deb',
        // A dev build carries no bundle stamp; AppImage is the Linux default.
        'linux-x86_64-unknown' => 'linux',
        'windows-x86_64-nsis' => 'windows',
        'windows-x86_64-msi' => 'windows',
        'windows-x86_64-unknown' => 'windows',
        'darwin-aarch64-app' => 'macos-arm64',
        'darwin-aarch64-unknown' => 'macos-arm64',
        'darwin-x86_64-app' => 'macos-x64',
        'darwin-x86_64-unknown' => 'macos-x64',
    ];

    public function __construct(private readonly ReleaseArtifact $artifacts) {}

    public function check(
        string $target,
        string $arch,
        string $bundleType,
        string $current,
    ): JsonResponse|Response {
        $platform = self::PLATFORM_MAP[strtolower("{$target}-{$arch}-{$bundleType}")] ?? null;
        if ($platform === null) {
            return $this->upToDate();
        }

        $release = (array) config("releases.platforms.{$platform}", []);
        if ($release === []) {
            return $this->upToDate();
        }

        $version = trim((string) ($release['version'] ?? ''));
        $signature = trim((string) ($release['signature'] ?? ''));

        // No signature means this artifact was built before signing was wired
        // up, or the CI secret was missing. The app would reject it anyway —
        // stay silent rather than hand out an update that cannot install.
        if ($version === '' || $signature === '' || ! $this->isVersion($version)) {
            return $this->upToDate();
        }

        if (! $this->isVersion($current) || version_compare($version, $current, '<=')) {
            return $this->upToDate();
        }

        // Last gate: the bytes must actually be on disk, the right size and
        // the right hash. Advertising a half-uploaded artifact would strand a
        // working install behind a download that can never verify.
        try {
            if ($this->artifacts->size($platform, $release) === null) {
                return $this->upToDate();
            }
        } catch (Throwable) {
            return $this->upToDate();
        }

        return response()->json([
            'version' => $version,
            'notes' => (string) ($release['notes'] ?? ''),
            'pub_date' => $this->pubDate($release),
            'url' => url("/downloads/{$platform}"),
            'signature' => $signature,
        ]);
    }

    /** Tauri reads any 204 as "nothing to do" and stays quiet. */
    private function upToDate(): Response
    {
        return response()->noContent();
    }

    private function isVersion(string $value): bool
    {
        return preg_match('/\A\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\z/', $value) === 1;
    }

    /** RFC 3339, which is the only format the updater will parse. */
    private function pubDate(array $release): string
    {
        $configured = trim((string) ($release['published_at'] ?? ''));
        if ($configured !== '') {
            return $configured;
        }

        return now()->toRfc3339String();
    }
}
