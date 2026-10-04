<?php
namespace App\Services\CloudComputer;

/** Streams a request body to a scratch file in chunks: size cap and SHA-256 are checked as the bytes arrive, nothing is held in memory. */
class SyncUpload
{
    public const CHUNK = 1048576;

    /** @param resource $source @return array{path:string,bytes:int,sha256:string} */
    public function spool($source, int $cap, ?string $tooLarge = null): array
    {
        $tmp = tempnam(sys_get_temp_dir(), 'vsync');
        $out = fopen($tmp, 'wb'); $hash = hash_init('sha256'); $bytes = 0;
        try {
            while (!feof($source)) {
                $chunk = fread($source, self::CHUNK);
                if ($chunk === false) break;
                if ($chunk === '') continue;
                $bytes += strlen($chunk);
                if ($bytes > $cap) Computers::fail('too_large', $tooLarge ?? 'This project is too large to sync ('.number_format($cap / 1048576).' MiB per upload).', 413);
                hash_update($hash, $chunk);
                fwrite($out, $chunk);
            }
        } catch (\Throwable $e) { fclose($out); @unlink($tmp); throw $e; }
        fclose($out);
        return ['path' => $tmp, 'bytes' => $bytes, 'sha256' => hash_final($hash)];
    }

    /** Moves the scratch file onto the sync disk (streamed) and removes it. */
    public function store(string $tmp, string $path): void
    {
        $in = fopen($tmp, 'rb');
        try { app(SyncRetention::class)->disk()->writeStream($path, $in); }
        finally { if (is_resource($in)) fclose($in); @unlink($tmp); }
    }
}
