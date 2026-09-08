<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MacDesktopUpdateTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('releases');
        config(['releases.disk' => 'releases']);
    }

    private function configure(string $arch): array
    {
        $body = 'mac-'.$arch.'-archive';
        $release = [
            'architecture' => $arch, 'version' => '0.6.3',
            'path' => "private/Vibyra-{$arch}.app.tar.gz",
            'filename' => "Vibyra-{$arch}.app.tar.gz",
            'size_bytes' => strlen($body), 'sha256' => hash('sha256', $body),
            'signature' => 'signed-archive', 'minimum_system_version' => '12.0',
            'expected_extension' => 'gz', 'require_complete_metadata' => true,
        ];
        config(["macos-updates.macos-{$arch}" => $release]);
        Storage::disk('releases')->put($release['path'], $body);

        return [$release, $body];
    }

    public function test_each_mac_architecture_downloads_its_signed_archive_for_updates(): void
    {
        foreach (['arm64' => 'aarch64', 'x64' => 'x86_64'] as $arch => $target) {
            [$release, $body] = $this->configure($arch);
            $dmg = array_replace($release, [
                'path' => "private/Vibyra-{$arch}.dmg", 'filename' => "Vibyra-{$arch}.dmg",
                'expected_extension' => 'dmg', 'signature' => '',
                'size_bytes' => 9, 'sha256' => hash('sha256', 'installer'),
            ]);
            config(["releases.platforms.macos-{$arch}" => $dmg]);
            Storage::disk('releases')->put($dmg['path'], 'installer');
            $installer = $this->get("/downloads/macos-{$arch}")->assertOk()->assertDownload($dmg['filename']);
            $this->assertSame('installer', $installer->streamedContent());
            foreach (['app', 'unknown'] as $bundle) {
                $this->getJson("/web-api/updates/darwin/{$target}/{$bundle}/0.6.2")
                    ->assertOk()->assertJsonPath('url', url("/downloads/macos-{$arch}/update"))
                    ->assertJsonPath('signature', $release['signature']);
            }
            $response = $this->get("/downloads/macos-{$arch}/update")
                ->assertOk()->assertDownload($release['filename']);
            $this->assertSame($body, $response->streamedContent());
            $this->getJson("/web-api/updates/darwin/{$target}/app/0.6.3")->assertNoContent();
            $this->getJson("/web-api/updates/darwin/{$target}/app/0.6.4")->assertNoContent();
        }
    }

    public function test_a_dmg_signature_is_never_used_as_a_mac_update(): void
    {
        config(['releases.platforms.macos-arm64.signature' => 'dmg-signature',
            'macos-updates.macos-arm64' => []]);
        $this->getJson('/web-api/updates/darwin/aarch64/app/0.6.2')->assertNoContent();
        $this->get('/downloads/macos-arm64/update')->assertStatus(503);
    }

    public function test_mac_updates_reject_missing_unsigned_corrupt_and_wrong_architecture_archives(): void
    {
        [$release] = $this->configure('arm64');
        foreach (['signature' => '', 'sha256' => str_repeat('0', 64), 'size_bytes' => 1,
            'architecture' => 'x64', 'filename' => 'other.gz', 'path' => 'missing.app.tar.gz'] as $key => $value) {
            config(['macos-updates.macos-arm64' => array_replace($release, [$key => $value])]);
            $this->getJson('/web-api/updates/darwin/aarch64/app/0.6.2')->assertNoContent();
            $this->get('/downloads/macos-arm64/update')->assertStatus(503);
        }
    }
}
