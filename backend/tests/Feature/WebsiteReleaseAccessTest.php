<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Billing\MembershipEntitlement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class WebsiteReleaseAccessTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('releases');
        config([
            'releases.disk' => 'releases',
            'releases.platforms.windows' => [
                'label' => 'Vibyra for Windows', 'version' => '1.2.3',
                'path' => 'private/windows/Vibyra.exe', 'filename' => 'Vibyra-1.2.3.exe',
                'sha256' => hash('sha256', 'windows-binary'), 'size_bytes' => strlen('windows-binary'),
                'expected_extension' => 'exe', 'require_complete_metadata' => true,
            ],
            'releases.platforms.linux' => [
                'label' => 'Vibyra for Linux', 'version' => '1.2.3',
                'path' => 'private/linux/Vibyra.AppImage', 'filename' => 'Vibyra-1.2.3.AppImage',
                'sha256' => hash('sha256', 'linux-binary'), 'size_bytes' => strlen('linux-binary'),
                'expected_extension' => 'appimage', 'require_complete_metadata' => true,
            ],
            'releases.platforms.macos-arm64' => [
                'label' => 'Vibyra for macOS (Apple Silicon)', 'architecture' => 'arm64',
                'path' => '', 'filename' => '', 'sha256' => '', 'size_bytes' => 0,
                'expected_extension' => 'dmg', 'version' => '',
                'minimum_system_version' => '12.0',
                'require_complete_metadata' => true,
            ],
            'releases.platforms.macos-x64' => [
                'label' => 'Vibyra for macOS (Intel)', 'architecture' => 'x64',
                'path' => '', 'filename' => '', 'sha256' => '', 'size_bytes' => 0,
                'expected_extension' => 'dmg', 'version' => '',
                'minimum_system_version' => '12.0',
                'require_complete_metadata' => true,
            ],
        ]);
    }

    public function test_entitlement_requires_recognized_paid_unexpired_membership(): void
    {
        $service = app(MembershipEntitlement::class);
        $cases = [
            ['free', 'stripe', now()->addMonth(), false],
            ['builder', null, now()->addMonth(), false],
            ['builder', 'stripe', now()->subSecond(), false],
            ['builder', 'stripe', now()->addMonth(), true],
            ['pro', 'manual', now()->addMonth(), true],
        ];

        foreach ($cases as [$plan, $provider, $endsAt, $expected]) {
            $user = User::factory()->make([
                'plan' => $plan,
                'billing_provider' => $provider,
                'membership_ends_at' => $endsAt,
            ]);
            $this->assertSame($expected, $service->active($user));
        }
    }

    public function test_release_metadata_is_public_and_hides_private_storage_keys(): void
    {
        Storage::disk('releases')->put('private/windows/Vibyra.exe', 'windows-binary');
        Storage::disk('releases')->put('private/linux/Vibyra.AppImage', 'linux-binary');
        $response = $this->getJson('/web-api/releases')
            ->assertOk()
            ->assertJsonCount(4, 'releases')
            ->assertJsonPath('releases.0.platform', 'windows')
            ->assertJsonPath('releases.0.available', true)
            ->assertJsonPath('releases.3.platform', 'macos')
            ->assertJsonPath('releases.3.available', false)
            ->assertJsonPath('releases.3.variants.0.platform', 'macos-arm64')
            ->assertJsonPath('releases.3.variants.1.platform', 'macos-x64')
            ->assertJsonMissingPath('releases.0.path')
            ->assertJsonMissingPath('releases.0.disk');

        $this->assertStringNotContainsString('private/windows', $response->getContent());
    }

    public function test_download_page_and_files_are_public(): void
    {
        Storage::disk('releases')->put('private/windows/Vibyra.exe', 'windows-binary');
        $this->get('/downloads')->assertOk();
        $response = $this->get('/downloads/windows')
            ->assertOk()
            ->assertDownload('Vibyra-1.2.3.exe');
        $this->assertSame('windows-binary', $response->streamedContent());
    }

    public function test_missing_release_returns_controlled_unavailable_response(): void
    {
        Storage::disk('releases')->put('private/windows/Vibyra.exe', 'truncated');
        $this->getJson('/downloads/windows')->assertStatus(503);
        $this->getJson('/downloads/linux')
            ->assertStatus(503)
            ->assertJsonPath('code', 'release_unavailable');
    }

    public function test_macos_requires_complete_metadata_and_a_real_artifact(): void
    {
        $armPayload = 'mac-arm-binary';
        $armPath = 'private/macos/Vibyra-arm64.dmg';
        Storage::disk('releases')->put($armPath, $armPayload);
        config(['releases.platforms.macos-arm64.path' => $armPath]);

        $this->getJson('/web-api/releases')
            ->assertOk()
            ->assertJsonPath('releases.3.variants.0.available', false);
        $this->getJson('/downloads/macos-arm64')->assertStatus(503);

        config(['releases.platforms.macos-arm64' => $this->macRelease(
            'arm64', $armPath, 'Vibyra-1.2.3-arm64.dmg', $armPayload,
        )]);

        $this->getJson('/web-api/releases')
            ->assertOk()
            ->assertJsonPath('releases.3.available', true)
            ->assertJsonPath('releases.3.variants.0.available', true)
            ->assertJsonPath('releases.3.variants.0.architecture', 'arm64')
            ->assertJsonPath('releases.3.variants.0.minimumSystemVersion', '12.0')
            ->assertJsonPath('releases.3.variants.0.sha256', hash('sha256', $armPayload))
            ->assertJsonPath('releases.3.variants.0.downloadUrl', '/downloads/macos-arm64')
            ->assertJsonPath('releases.3.variants.1.available', false);
        $response = $this->get('/downloads/macos-arm64')
            ->assertOk()->assertDownload('Vibyra-1.2.3-arm64.dmg');
        $this->assertSame($armPayload, $response->streamedContent());
        $this->getJson('/downloads/macos-x64')->assertStatus(503);
    }

    public function test_macos_fails_closed_for_invalid_integrity_metadata(): void
    {
        $payload = 'mac-intel-binary';
        $path = 'private/macos/Vibyra-x64.dmg';
        Storage::disk('releases')->put($path, $payload);
        $release = $this->macRelease('x64', $path, 'Vibyra-1.2.3-x64.dmg', $payload);
        $release['require_complete_metadata'] = false;
        $release['sha256'] = 'not-a-sha256';
        config(['releases.platforms.macos-x64' => $release]);

        $this->getJson('/web-api/releases')
            ->assertOk()->assertJsonPath('releases.3.variants.1.available', false);
        $this->getJson('/downloads/macos-x64')->assertStatus(503);

        $release['sha256'] = hash('sha256', $payload);
        $release['size_bytes']++;
        config(['releases.platforms.macos-x64' => $release]);
        $this->getJson('/downloads/macos-x64')->assertStatus(503);

        $release['size_bytes'] = strlen($payload);
        $release['sha256'] = hash('sha256', 'different-same-size');
        config(['releases.platforms.macos-x64' => $release]);
        $this->getJson('/downloads/macos-x64')->assertStatus(503);
    }

    public function test_download_route_rejects_non_allowlisted_platforms(): void
    {
        $this->get('/downloads/macos')->assertClientError();
        $this->get('/downloads/../../.env')->assertClientError();
    }

    private function macRelease(string $architecture, string $path, string $filename, string $payload): array
    {
        return [
            'label' => 'Vibyra for macOS', 'architecture' => $architecture,
            'version' => '1.2.3', 'path' => $path, 'filename' => $filename,
            'sha256' => hash('sha256', $payload), 'size_bytes' => strlen($payload),
            'minimum_system_version' => '12.0',
            'expected_extension' => 'dmg', 'require_complete_metadata' => true,
        ];
    }
}
