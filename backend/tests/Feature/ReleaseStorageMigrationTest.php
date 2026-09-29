<?php

namespace Tests\Feature;

use App\Services\ReleaseArtifact;
use App\Services\ReleaseCapacity;
use App\Services\ReleaseStorage;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ReleaseStorageMigrationTest extends TestCase
{
    public function test_copy_is_verified_idempotent_and_keeps_source(): void
    {
        Storage::fake('local');
        Storage::fake('release-object');
        $path = 'releases/windows/fixture.exe';
        Storage::disk('local')->put($path, 'verified bytes');
        $store = app(ReleaseStorage::class);
        $result = $store->copyVerified($path, 'local', 'release-object');
        $this->assertSame(hash('sha256', 'verified bytes'), $result['sha256']);
        $this->assertSame($result, $store->copyVerified($path, 'local', 'release-object'));
        $this->assertSame('verified bytes', Storage::disk('local')->get($path));
        Storage::disk('release-object')->put($path, 'wrong bytes');
        $this->expectException(\RuntimeException::class);
        $store->copyVerified($path, 'local', 'release-object');
    }

    public function test_fallback_only_applies_to_missing_primary_not_corruption(): void
    {
        Storage::fake('local');
        Storage::fake('release-object');
        config(['releases.disk' => 'release-object', 'releases.fallback_disk' => 'local']);
        $path = 'releases/windows/fixture.exe';
        Storage::disk('local')->put($path, 'good');
        $release = ['version' => '1.0.0', 'path' => $path, 'filename' => 'fixture.exe',
            'expected_extension' => 'exe', 'size_bytes' => 4, 'sha256' => hash('sha256', 'good'),
            'require_complete_metadata' => true];
        $this->assertSame(4, app(ReleaseArtifact::class)->size('windows', $release));
        Storage::disk('release-object')->put($path, 'evil');
        $this->assertNull(app(ReleaseArtifact::class)->size('windows', $release));
        $this->assertNull(app(ReleaseStorage::class)->diskFor('../private/key'));
    }

    public function test_capacity_reserves_space_for_upload_and_warns_early(): void
    {
        $capacity = new ReleaseCapacity;
        $gb = 1024 ** 3;
        $this->assertSame('warning', $capacity->assess(10 * $gb, 2 * $gb)['status']);
        $result = $capacity->assess(10 * $gb, 2 * $gb, 2 * $gb);
        $this->assertSame('critical', $result['status']);
        $this->assertFalse($result['uploadAllowed']);
        $this->assertTrue($capacity->assess(10 * $gb, 4 * $gb, $gb)['uploadAllowed']);
    }
    public function test_range_skips_nonseekable_object_stream_without_seek_warning(): void
    {
        [$source, $writer] = stream_socket_pair(STREAM_PF_UNIX, STREAM_SOCK_STREAM, STREAM_IPPROTO_IP);
        fwrite($writer, '0123456789');
        stream_socket_shutdown($writer, STREAM_SHUT_WR);
        $disk = \Mockery::mock(\Illuminate\Filesystem\FilesystemAdapter::class);
        $disk->shouldReceive('readStream')->once()->with('releases/test.bin')->andReturn($source);
        Storage::shouldReceive('disk')->once()->with('object')->andReturn($disk);
        $this->app->instance('request', \Illuminate\Http\Request::create('/download', 'GET', [], [], [], ['HTTP_RANGE' => 'bytes=3-6']));
        $response = app(\App\Services\ReleaseStream::class)->download('object', 'releases/test.bin', 'test.bin', 10, []);
        $this->assertSame(206, $response->getStatusCode());
        $this->assertSame('bytes 3-6/10', $response->headers->get('Content-Range'));
        $this->assertSame('4', $response->headers->get('Content-Length'));
        ob_start();
        try { $response->sendContent(); $body = ob_get_contents(); }
        finally { ob_end_clean(); fclose($writer); }
        $this->assertSame('3456', $body);
    }

}
