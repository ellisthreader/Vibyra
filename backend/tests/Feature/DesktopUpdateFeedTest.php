<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * The feed the installed desktop app polls. Every assertion here is a case
 * where getting it wrong either strands users on an old build (a false 204) or
 * pushes them an update that cannot install (a 200 it should not have sent).
 */
class DesktopUpdateFeedTest extends TestCase
{
    use RefreshDatabase;

    private const APPIMAGE = 'linux-appimage-binary';

    private const DEB = 'linux-deb-binary';

    private const SIGNATURE = 'dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZQpSVVJ4';

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('releases');
        config([
            'releases.disk' => 'releases',
            'releases.platforms.linux' => $this->platform(
                'Vibyra.AppImage', self::APPIMAGE, 'appimage', '0.2.0',
            ),
            'releases.platforms.linux-deb' => $this->platform(
                'Vibyra.deb', self::DEB, 'deb', '0.2.0',
            ),
            'releases.platforms.windows' => $this->platform(
                'Vibyra.exe', 'windows-binary', 'exe', '0.2.0',
            ),
        ]);
        Storage::disk('releases')->put('private/Vibyra.AppImage', self::APPIMAGE);
        Storage::disk('releases')->put('private/Vibyra.deb', self::DEB);
        Storage::disk('releases')->put('private/Vibyra.exe', 'windows-binary');
    }

    private function platform(
        string $filename,
        string $body,
        string $extension,
        string $version,
        string $signature = self::SIGNATURE,
    ): array {
        return [
            'label' => 'Vibyra',
            'version' => $version,
            'path' => "private/{$filename}",
            'filename' => $filename,
            'size_bytes' => strlen($body),
            'sha256' => hash('sha256', $body),
            'signature' => $signature,
            'notes' => 'Faster terminals.',
            'published_at' => '2026-08-20T10:00:00Z',
            'expected_extension' => $extension,
            'require_complete_metadata' => true,
        ];
    }

    private function check(string $bundle, string $current, string $target = 'linux', string $arch = 'x86_64')
    {
        return $this->get("/web-api/updates/{$target}/{$arch}/{$bundle}/{$current}");
    }

    public function test_an_older_client_is_offered_the_signed_release(): void
    {
        $this->check('appimage', '0.1.3')
            ->assertOk()
            ->assertJsonPath('version', '0.2.0')
            ->assertJsonPath('signature', self::SIGNATURE)
            ->assertJsonPath('notes', 'Faster terminals.')
            ->assertJsonPath('pub_date', '2026-08-20T10:00:00Z')
            ->assertJsonPath('url', url('/downloads/linux'));
    }

    public function test_a_current_or_newer_client_gets_no_content(): void
    {
        $this->check('appimage', '0.2.0')->assertNoContent();
        $this->check('appimage', '0.3.0')->assertNoContent();
    }

    /** A .deb and an AppImage are different files with different signatures. */
    public function test_each_bundle_type_resolves_to_its_own_artifact(): void
    {
        $this->check('deb', '0.1.3')
            ->assertOk()
            ->assertJsonPath('url', url('/downloads/linux-deb'));

        $this->check('nsis', '0.1.3', 'windows')
            ->assertOk()
            ->assertJsonPath('url', url('/downloads/windows'));
    }

    /** A dev build carries no bundle stamp and sends "unknown". */
    public function test_an_unstamped_linux_build_falls_back_to_the_appimage(): void
    {
        $this->check('unknown', '0.1.3')
            ->assertOk()
            ->assertJsonPath('url', url('/downloads/linux'));
    }

    public function test_an_unsigned_release_is_never_advertised(): void
    {
        config(['releases.platforms.linux' => $this->platform(
            'Vibyra.AppImage', self::APPIMAGE, 'appimage', '0.2.0', signature: '',
        )]);

        $this->check('appimage', '0.1.3')->assertNoContent();
    }

    /** The artifact must be on disk, the right size and the right hash — a
     * half-uploaded file would strand a working install behind a bad download. */
    public function test_a_missing_or_corrupt_artifact_is_never_advertised(): void
    {
        Storage::disk('releases')->delete('private/Vibyra.AppImage');
        $this->check('appimage', '0.1.3')->assertNoContent();

        Storage::disk('releases')->put('private/Vibyra.AppImage', 'truncated');
        $this->check('appimage', '0.1.3')->assertNoContent();

        Storage::disk('releases')->put('private/Vibyra.AppImage', self::APPIMAGE);
        $this->check('appimage', '0.1.3')->assertOk();
    }

    public function test_unroutable_platform_combinations_are_rejected_or_silent(): void
    {
        // Rejected by the route constraints before the controller runs. The
        // status is 405, not 404, because an `OPTIONS {any}` catch-all is then
        // the only route left matching the URI — either way, never an update.
        foreach ([['appimage', '0.1.3', 'plan9'],
            ['sideload', '0.1.3', 'linux']] as [$bundle, $current, $target]) {
            $response = $this->check($bundle, $current, $target);
            $this->assertTrue(
                $response->getStatusCode() >= 400,
                "{$target}/{$bundle}/{$current} should never be served an update.",
            );
        }

        // Routable, but nothing to serve: silence, never an error the app
        // would have to interpret. A junk current-version reaches the
        // controller — the route pattern allows pre-release suffixes — and is
        // stopped by the semver guard there.
        $this->check('appimage', 'not-a-version')->assertNoContent();
        $this->check('appimage', '0.1.3', 'linux', 'armv7')->assertNoContent();
        $this->check('app', '0.1.3', 'darwin', 'aarch64')->assertNoContent();
    }

    public function test_a_malformed_configured_version_is_never_advertised(): void
    {
        config(['releases.platforms.linux' => $this->platform(
            'Vibyra.AppImage', self::APPIMAGE, 'appimage', 'nightly',
        )]);

        $this->check('appimage', '0.1.3')->assertNoContent();
    }

    /**
     * macOS is the one platform where the download and the update are different
     * files. Before the `updater` overlay existed, the single config entry had
     * to be a .dmg for the download page — and `ReleaseArtifact::ready()` then
     * rejected it for the feed on the extension check, so every Mac was told
     * "up to date" forever whatever was configured.
     */
    private function macos(): void
    {
        $dmg = 'mac-dmg-bytes';
        $archive = 'mac-updater-archive';
        Storage::disk('releases')->put('private/Vibyra.dmg', $dmg);
        Storage::disk('releases')->put('private/Vibyra.app.tar.gz', $archive);
        config(['releases.platforms.macos-arm64' => [
            'label' => 'Vibyra for macOS (Apple Silicon)',
            'architecture' => 'arm64',
            'version' => '0.7.0',
            'path' => 'private/Vibyra.dmg',
            'filename' => 'Vibyra.dmg',
            'size_bytes' => strlen($dmg),
            'sha256' => hash('sha256', $dmg),
            'minimum_system_version' => '12.0',
            'signature' => self::SIGNATURE,
            'expected_extension' => 'dmg',
            'require_complete_metadata' => true,
            'updater' => [
                'version' => '0.7.5',
                'path' => 'private/Vibyra.app.tar.gz',
                'filename' => 'Vibyra.app.tar.gz',
                'size_bytes' => strlen($archive),
                'sha256' => hash('sha256', $archive),
                'signature' => self::SIGNATURE,
                'notes' => 'Live updates.',
                'published_at' => '2026-09-21T09:00:00Z',
                'expected_extension' => 'gz',
            ],
        ]]);
    }

    public function test_a_mac_client_is_offered_the_signed_archive_not_the_dmg(): void
    {
        $this->macos();

        $this->check('app', '0.7.4', 'darwin', 'aarch64')
            ->assertOk()
            ->assertJsonPath('version', '0.7.5')
            ->assertJsonPath('notes', 'Live updates.')
            ->assertJsonPath('pub_date', '2026-09-21T09:00:00Z')
            ->assertJsonPath('url', url('/downloads/macos-arm64/update'));
    }

    /** The updater version is its own line: a Mac on 0.7.5 is current even
     * though the public .dmg is still back at 0.7.0. */
    public function test_the_mac_update_version_is_independent_of_the_download(): void
    {
        $this->macos();

        $this->check('app', '0.7.5', 'darwin', 'aarch64')->assertNoContent();
        $this->get('/downloads/macos-arm64')->assertOk()
            ->assertHeader('content-disposition', 'attachment; filename=Vibyra.dmg');
        $this->get('/downloads/macos-arm64/update')->assertOk()
            ->assertHeader('content-disposition', 'attachment; filename=Vibyra.app.tar.gz');
    }

    /** An empty overlay must read as "not configured" and fall through, not as
     * "configured with nothing" — unset Railway variables arrive as '' and 0. */
    public function test_an_unconfigured_overlay_falls_back_to_the_single_artifact(): void
    {
        config(['releases.platforms.linux' => array_merge(
            $this->platform('Vibyra.AppImage', self::APPIMAGE, 'appimage', '0.2.0'),
            ['updater' => ['version' => '', 'path' => '', 'size_bytes' => 0]],
        )]);

        $this->check('appimage', '0.1.3')
            ->assertOk()
            ->assertJsonPath('version', '0.2.0')
            ->assertJsonPath('url', url('/downloads/linux'));
        $this->get('/downloads/linux/update')->assertNotFound();
    }
}
