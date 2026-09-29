<?php

namespace App\Services;

use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Bounded-memory full/range responses keep public URLs stable during migration. */
class ReleaseStream
{
    public function download(string $disk, string $path, string $filename, int $size, array $headers): StreamedResponse
    {
        [$start, $end, $partial] = $this->range(request()->header('Range'), $size);
        $length = $end - $start + 1;
        $stream = Storage::disk($disk)->readStream($path);
        if (! is_resource($stream)) {
            throw new \RuntimeException('Release stream unavailable.');
        }
        try {
            if ($start > 0 && (! (stream_get_meta_data($stream)['seekable'] ?? false) || fseek($stream, $start) !== 0)) {
                // Non-seekable object streams are skipped in bounded chunks.
                $remaining = $start;
                while ($remaining > 0) {
                    $chunk = fread($stream, min(65536, $remaining));
                    if ($chunk === false || $chunk === '') {
                        throw new \RuntimeException('Release range unavailable.');
                    }
                    $remaining -= strlen($chunk);
                }
            }
        } catch (\Throwable $error) {
            fclose($stream);
            throw $error;
        }
        $headers += ['Accept-Ranges' => 'bytes', 'Content-Length' => (string) $length,
            'Content-Type' => 'application/octet-stream'];
        if ($partial) {
            $headers['Content-Range'] = "bytes {$start}-{$end}/{$size}";
        }
        return response()->streamDownload(function () use ($stream, $length): void {
            try {
                $remaining = $length;
                while ($remaining > 0 && ! connection_aborted()) {
                    $chunk = fread($stream, min(65536, $remaining));
                    if ($chunk === false || $chunk === '') {
                        break;
                    }
                    echo $chunk;
                    $remaining -= strlen($chunk);
                }
            } finally {
                fclose($stream);
            }
        }, $filename, $headers)->setStatusCode($partial ? 206 : 200);
    }

    private function range(?string $range, int $size): array
    {
        if ($range === null || request()->header('If-Range') !== null) {
            return [0, $size - 1, false];
        }
        $valid = preg_match('/\Abytes=(\d*)-(\d*)\z/', $range, $parts) === 1;
        if (! $valid || ($parts[1] === '' && $parts[2] === '')) {
            abort(416, '', ['Content-Range' => "bytes */{$size}"]);
        }
        $start = $parts[1] === '' ? max(0, $size - (int) $parts[2]) : (int) $parts[1];
        $end = $parts[1] === '' || $parts[2] === '' ? $size - 1 : min($size - 1, (int) $parts[2]);
        if ($start >= $size || $end < $start) {
            abort(416, '', ['Content-Range' => "bytes */{$size}"]);
        }

        return [$start, $end, true];
    }
}
