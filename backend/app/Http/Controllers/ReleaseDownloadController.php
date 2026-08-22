<?php

namespace App\Http\Controllers;

use App\Services\ReleaseArtifact;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

class ReleaseDownloadController extends Controller
{
    public function __construct(private readonly ReleaseArtifact $artifacts) {}

    private const PLATFORMS = ['windows', 'linux', 'linux-deb', 'macos-arm64', 'macos-x64'];

    public function index(): JsonResponse
    {
        $metadata = collect(self::PLATFORMS)
            ->map(fn (string $platform) => $this->metadata(
                $platform,
                (array) config('releases.platforms.'.$platform, []),
            ));
        $macVariants = $metadata->filter(
            fn (array $release) => str_starts_with($release['platform'], 'macos-'),
        )->values()->all();
        $releases = [
            $metadata->firstWhere('platform', 'windows'),
            $metadata->firstWhere('platform', 'linux'),
            $metadata->firstWhere('platform', 'linux-deb'),
            [
                'platform' => 'macos',
                'label' => 'Vibyra for macOS',
                'available' => collect($macVariants)->contains('available', true),
                'variants' => $macVariants,
            ],
        ];

        return response()->json(['ok' => true, 'releases' => $releases]);
    }

    public function download(string $platform): JsonResponse|StreamedResponse
    {
        if (! in_array($platform, self::PLATFORMS, true)) {
            abort(404);
        }

        $release = (array) config("releases.platforms.{$platform}", []);
        if ($release === []) {
            abort(404);
        }

        $path = trim((string) ($release['path'] ?? ''));
        try {
            if ($this->artifacts->size($platform, $release) === null) {
                return $this->unavailable();
            }

            $filename = basename((string) ($release['filename'] ?? basename($path)));
            $headers = [
                'Cache-Control' => 'public, max-age=300',
                'X-Content-Type-Options' => 'nosniff',
                'X-Checksum-SHA256' => (string) ($release['sha256'] ?? ''),
            ];

            return Storage::disk((string) config('releases.disk', 'local'))
                ->download($path, $filename, $headers);
        } catch (Throwable) {
            return $this->unavailable();
        }
    }

    private function metadata(string $platform, array $release): array
    {
        $available = false;
        $size = (int) ($release['size_bytes'] ?? 0);

        try {
            $artifactSize = $this->artifacts->size($platform, $release);
            if ($artifactSize !== null) {
                $available = true;
                $size = $artifactSize;
            }
        } catch (Throwable) {
            $available = false;
        }

        return [
            'platform' => $platform,
            'architecture' => (string) ($release['architecture'] ?? ''),
            'label' => (string) ($release['label'] ?? ucfirst($platform)),
            'version' => (string) ($release['version'] ?? ''),
            'filename' => basename((string) ($release['filename'] ?? '')),
            'sizeBytes' => max(0, $size),
            'sha256' => (string) ($release['sha256'] ?? ''),
            'minimumSystemVersion' => (string) ($release['minimum_system_version'] ?? ''),
            'available' => $available,
            'downloadUrl' => "/downloads/{$platform}",
        ];
    }

    private function unavailable(): JsonResponse
    {
        return response()->json([
            'ok' => false,
            'code' => 'release_unavailable',
            'error' => 'This Vibyra release is temporarily unavailable.',
        ], 503);
    }
}
