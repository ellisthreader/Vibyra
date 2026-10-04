<?php
namespace App\Services\CloudComputer;

use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Raw ciphertext downloads straight from the sync disk, with a single `Range` (resumable) and no buffering. */
class SyncDownload
{
    public function response(Request $request, object $blob): StreamedResponse
    {
        $size = (int) $blob->bytes; $start = 0; $end = $size - 1; $status = 200;
        $headers = ['Content-Type' => 'application/octet-stream', 'Accept-Ranges' => 'bytes', 'Cache-Control' => 'private, no-store', 'ETag' => '"'.$blob->sha256.'"',
            'X-Content-Type-Options' => 'nosniff'];
        $range = (string) $request->header('Range');
        if ($range !== '') {
            if (!preg_match('/^bytes=(\d*)-(\d*)$/', trim($range), $m) || ($m[1] === '' && $m[2] === '')) return $this->unsatisfiable($size);
            if ($m[1] === '') { $start = max(0, $size - (int) $m[2]); }
            else { $start = (int) $m[1]; if ($m[2] !== '') $end = min($end, (int) $m[2]); }
            if ($start > $end || $start >= $size) return $this->unsatisfiable($size);
            $status = 206; $headers['Content-Range'] = "bytes $start-$end/$size";
        }
        $headers['Content-Length'] = (string) ($end - $start + 1);
        $path = $blob->path;
        return new StreamedResponse(function () use ($path, $start, $end) {
            $in = app(SyncRetention::class)->disk()->readStream($path);
            if (!is_resource($in)) return;
            try {
                if ($start > 0 && (stream_get_meta_data($in)['seekable'] ?? false)) fseek($in, $start);
                elseif ($start > 0) { for ($skip = $start; $skip > 0 && !feof($in);) { $skip -= strlen((string) fread($in, min(1048576, $skip))); } }
                for ($left = $end - $start + 1; $left > 0 && !feof($in);) {
                    $chunk = fread($in, min(65536, $left));
                    if ($chunk === false || $chunk === '') break;
                    $left -= strlen($chunk); echo $chunk; flush();
                }
            } finally { fclose($in); }
        }, $status, $headers);
    }

    private function unsatisfiable(int $size): StreamedResponse
    {
        return new StreamedResponse(fn () => null, 416, ['Content-Range' => "bytes */$size"]);
    }
}
