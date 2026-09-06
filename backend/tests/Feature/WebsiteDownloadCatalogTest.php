<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class WebsiteDownloadCatalogTest extends TestCase
{
    public function test_download_views_use_the_marketing_design_without_authentication(): void
    {
        $this->withoutVite();
        $this->get('/downloads')->assertOk()->assertViewIs('downloads');
        $this->get('/account/downloads')->assertOk()->assertViewIs('downloads');
    }

    public function test_normal_environments_use_local_release_authority(): void
    {
        Http::preventStrayRequests();
        config(['releases.platforms' => []]);
        $this->getJson('/web-api/download-catalog')->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('releases.0.available', false)
            ->assertJsonMissingPath('downloadBaseUrl');
        Http::assertNothingSent();
    }

    public function test_local_preview_reads_public_metadata_without_forwarding_cookies(): void
    {
        $this->app->instance('env', 'local');
        Http::fake(['https://vibyra-production.up.railway.app/web-api/releases' => Http::response([
            'ok' => true, 'releases' => [['platform' => 'windows', 'available' => false]],
        ])]);
        $this->withHeader('Cookie', 'local-preview=private')->getJson('/web-api/download-catalog')
            ->assertOk()->assertJsonPath('downloadBaseUrl', 'https://vibyra-production.up.railway.app')
            ->assertJsonPath('releases.0.available', false);
        Http::assertSent(fn ($request) => $request->method() === 'GET'
            && $request->url() === 'https://vibyra-production.up.railway.app/web-api/releases'
            && ! $request->hasHeader('Cookie') && ! $request->hasHeader('Authorization'));
    }

    public function test_local_preview_does_not_invent_releases_when_upstream_fails(): void
    {
        $this->app->instance('env', 'local');
        Http::fake(['*' => Http::response(['ok' => false], 503)]);
        $this->getJson('/web-api/download-catalog')->assertStatus(503)
            ->assertJsonPath('ok', false)->assertJsonMissingPath('releases');
    }

    public function test_local_preview_rejects_malformed_metadata(): void
    {
        $this->app->instance('env', 'local');
        Http::fake(['*' => Http::response(['ok' => true, 'releases' => 'not-a-catalog'])]);
        $this->getJson('/web-api/download-catalog')->assertStatus(503);
    }
}
