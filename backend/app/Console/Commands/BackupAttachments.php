<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use League\Flysystem\Local\LocalFilesystemAdapter;
use RuntimeException;

final class BackupAttachments extends Command
{
    protected $signature = 'vibyra:backup-attachments';

    protected $description = 'Encrypt persisted customer attachments to the private recovery bucket';

    private const PREFIX = 'vibyra-production/attachments/';

    private const AAD = 'vibyra-production-backup-v1';

    public function handle(): int
    {
        if (! config('ops_backup.enabled')) {
            $this->info('Attachment backup disabled.');

            return self::SUCCESS;
        }
        try {
            $key = base64_decode((string) config('ops_backup.key'), true);
            if ($key === false || strlen($key) !== 32) {
                throw new RuntimeException('invalid-key');
            }
            $source = Storage::disk(config('vibes.attachments_disk', 'local'));
            $destination = Storage::build(config('ops_backup.disk'));
            $manifest = $this->snapshot($source, $destination, $key);
            $this->line(json_encode($manifest, JSON_THROW_ON_ERROR));

            return self::SUCCESS;
        } catch (\Throwable) {
            // Source paths and provider exceptions can contain private data or credentials.
            $this->error('Attachment backup failed; inspect configured storage and recovery credentials.');

            return self::FAILURE;
        }
    }

    public function snapshot(FilesystemAdapter $source, FilesystemAdapter $destination, string $key): array
    {
        $stamp = now()->utc()->format('Ymd\THis\Z').'-'.Str::uuid();
        $prefix = self::PREFIX.$stamp.'/';
        $files = [];
        $total = 0;
        // Only application attachment storage, never releases, logs, sessions or arbitrary paths.
        foreach ($source->allFiles('vibes-attachments') as $path) {
            if (! str_starts_with($path, 'vibes-attachments/') || str_contains($path, '..')) {
                throw new RuntimeException('invalid-attachment-path');
            }
            if ($source->getAdapter() instanceof LocalFilesystemAdapter
                && is_link($source->path($path))) {
                throw new RuntimeException('symlink-not-backed-up');
            }
            $size = $source->size($path);
            // App attachments are bounded; encrypt one file at a time to bound PHP memory.
            if ($size > 16 * 1024 * 1024 || count($files) >= 10000 || $total + $size > 1024 * 1024 * 1024) {
                throw new RuntimeException('snapshot-safety-limit');
            }
            $bytes = $source->get($path);
            if (strlen($bytes) !== $size) {
                throw new RuntimeException('source-changed-during-read');
            }
            $object = $prefix.count($files).'.aesgcm';
            $this->verifiedPut($destination, $object, $this->encrypt($bytes, $key));
            $files[] = ['path' => $path, 'object' => $object, 'bytes' => $size,
                'sha256' => hash('sha256', $bytes)];
            $total += $size;
            unset($bytes);
        }
        $manifest = ['format' => 1, 'createdUtc' => now()->utc()->toIso8601String(),
            'files' => $files, 'appKey' => config('app.key')];
        $encrypted = $this->encrypt(json_encode($manifest, JSON_THROW_ON_ERROR), $key);
        $manifestObject = $prefix.'manifest.json.aesgcm';
        $this->verifiedPut($destination, $manifestObject, $encrypted);
        $receipt = ['createdUtc' => $manifest['createdUtc'], 'files' => count($files),
            'bytes' => $total, 'manifestObject' => $manifestObject,
            'encryptedSha256' => hash('sha256', $encrypted), 'readbackVerified' => true];
        $this->verifiedPut($destination, 'vibyra-production/attachments-latest.json',
            json_encode($receipt, JSON_THROW_ON_ERROR));

        return $receipt;
    }

    private function verifiedPut(FilesystemAdapter $destination, string $object, string $encrypted): void
    {
        if (! $destination->put($object, $encrypted)
            || ! hash_equals(hash('sha256', $encrypted), hash('sha256', $destination->get($object)))) {
            throw new RuntimeException('encrypted-readback-mismatch');
        }
    }

    private function encrypt(string $bytes, string $key): string
    {
        $nonce = random_bytes(12);
        $tag = '';
        $ciphertext = openssl_encrypt($bytes, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $nonce, $tag, self::AAD, 16);
        if ($ciphertext === false) {
            throw new RuntimeException('encryption-failed');
        }

        // Shared Python AESGCM envelope; tag follows ciphertext.
        return "VIBYRA1\n".$nonce.$ciphertext.$tag;
    }
}
