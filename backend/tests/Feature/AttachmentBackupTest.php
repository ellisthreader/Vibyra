<?php

namespace Tests\Feature;

use App\Console\Commands\BackupAttachments;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Support\Facades\Storage;
use Mockery;
use Tests\TestCase;

class AttachmentBackupTest extends TestCase
{
    private function decode(string $data, string $key): string
    {
        $this->assertSame("VIBYRA1\n", substr($data, 0, 8));
        $plain = openssl_decrypt(substr($data, 20, -16), 'aes-256-gcm', $key,
            OPENSSL_RAW_DATA, substr($data, 8, 12), substr($data, -16), 'vibyra-production-backup-v1');
        $this->assertNotFalse($plain);

        return $plain;
    }

    public function test_encrypted_snapshot_roundtrips_files_key_and_manifest_without_releases(): void
    {
        Storage::fake('source');
        Storage::fake('backup');
        $source = Storage::disk('source');
        $destination = Storage::disk('backup');
        $source->put('vibes-attachments/user-id/image.png', 'private content');
        $source->put('macos/installer.dmg', 'not customer backup');
        config(['app.key' => 'original-key']);
        $key = random_bytes(32);
        $receipt = app(BackupAttachments::class)->snapshot($source, $destination, $key);
        $this->assertSame(1, $receipt['files']);
        $manifest = json_decode($this->decode($destination->get($receipt['manifestObject']), $key), true);
        $this->assertSame('original-key', $manifest['appKey']);
        $file = $manifest['files'][0];
        $this->assertSame('private content', $this->decode($destination->get($file['object']), $key));
        $this->assertSame(hash('sha256', 'private content'), $file['sha256']);
        $this->assertStringNotContainsString('private content', $destination->get($file['object']));
        $second = app(BackupAttachments::class)->snapshot($source, $destination, $key);
        $this->assertNotSame($receipt['manifestObject'], $second['manifestObject']);
    }

    public function test_empty_attachment_storage_is_a_valid_recovery_snapshot(): void
    {
        Storage::fake('source');
        Storage::fake('backup');
        $receipt = app(BackupAttachments::class)->snapshot(Storage::disk('source'), Storage::disk('backup'), random_bytes(32));
        $this->assertSame(0, $receipt['files']);
        $this->assertTrue($receipt['readbackVerified']);
    }

    public function test_failed_readback_never_promotes_latest_marker(): void
    {
        Storage::fake('source');
        Storage::disk('source')->put('vibes-attachments/a', 'contents');
        $destination = Mockery::mock(FilesystemAdapter::class);
        $destination->shouldReceive('put')->once()->withArgs(fn ($key) => str_ends_with($key, '/0.aesgcm'))->andReturn(true);
        $destination->shouldReceive('get')->once()->andReturn('corrupted');
        $this->expectException(\RuntimeException::class);
        app(BackupAttachments::class)->snapshot(Storage::disk('source'), $destination, random_bytes(32));
    }

    public function test_disabled_schedule_does_not_access_provider(): void
    {
        config(['ops_backup.enabled' => false]);
        $this->artisan('vibyra:backup-attachments')->assertSuccessful();
    }
}
