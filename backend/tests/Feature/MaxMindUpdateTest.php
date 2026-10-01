<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Http;
use PharData;
use Tests\TestCase;

/**
 * 2026-10-01: on production the GeoLite download was killed silently while PHP unpacked it, leaving no
 * database, so every market-gated route answered 451. The command now unpacks with the system `tar`.
 */
class MaxMindUpdateTest extends TestCase
{
    private string $work;

    protected function setUp(): void
    {
        parent::setUp();
        $this->work = sys_get_temp_dir().'/maxmind-test-'.bin2hex(random_bytes(5));
        mkdir($this->work, 0755, true);
        config(['services.maxmind.account_id' => '123', 'services.maxmind.license_key' => 'test-key',
            'services.maxmind.database_path' => $this->work.'/out/GeoLite2-City.mmdb']);
    }

    protected function tearDown(): void
    {
        exec('rm -rf '.escapeshellarg($this->work));
        parent::tearDown();
    }

    private function archive(string $contents): string
    {
        $src = $this->work.'/src/GeoLite2-City_20261001';
        mkdir($src, 0755, true);
        file_put_contents($src.'/GeoLite2-City.mmdb', $contents);
        file_put_contents($src.'/COPYRIGHT.txt', 'terms');
        $tar = new PharData($this->work.'/db.tar');
        $tar->buildFromDirectory($this->work.'/src');
        $tar->compress(\Phar::GZ);

        return file_get_contents($this->work.'/db.tar.gz');
    }

    public function test_the_database_is_downloaded_unpacked_and_installed(): void
    {
        $payload = random_bytes(8192); // incompressible, so the archive clears the command's 1 KB sanity check
        Http::fake(['download.maxmind.com/*' => Http::response($this->archive($payload), 200)]);

        $this->artisan('maxmind:update', ['--force' => true])->assertExitCode(0);

        $this->assertSame($payload, file_get_contents($this->work.'/out/GeoLite2-City.mmdb'));
        $this->assertSame([], glob($this->work.'/out/tmp-*'), 'no half-finished temp folders are left behind');
        Http::assertSentCount(1);
    }

    public function test_a_failed_download_installs_nothing_and_reports_failure(): void
    {
        Http::fake(['download.maxmind.com/*' => Http::response('nope', 401)]);

        try {
            $this->artisan('maxmind:update', ['--force' => true])->run();
            $this->fail('A refused download must not look like success.');
        } catch (\Illuminate\Http\Client\RequestException $e) {
            $this->assertSame(401, $e->response->status());
        }

        $this->assertFileDoesNotExist($this->work.'/out/GeoLite2-City.mmdb');
    }
}
