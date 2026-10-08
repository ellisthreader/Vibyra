<?php

namespace Tests\Feature;

use Tests\TestCase;

class RemoteWebClientTest extends TestCase
{
    public function test_web_entry_uses_mobile_policy_and_cannot_bypass_headers_through_static_index(): void
    {
        if (!is_file(resource_path('mobile-web/index.html'))) {
            foreach (['/app', '/app/', '/app/index.html'] as $path) {
                $this->get($path)->assertRedirect('/downloads')->assertHeader('Cache-Control', 'no-store, private');
            }
            return;
        }
        $this->assertFileDoesNotExist(public_path('app/index.html'));
        foreach (['/app', '/app/', '/app/index.html'] as $path) {
            $response = $this->get($path)->assertOk()->assertHeader('X-Frame-Options', 'DENY')
                ->assertHeader('Referrer-Policy', 'no-referrer');
            $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
            $policy = $response->headers->get('Content-Security-Policy');
            $this->assertStringContainsString("script-src 'self'; script-src-attr 'none'", $policy);
            $this->assertStringNotContainsString('nonce-', $policy);
            $response->assertSee('/app/_expo/static/js/web/index-', false);
        }
        $bridge = file_get_contents(resource_path('mobile-web/assets/__vibyra/transport.html'));
        $this->assertStringContainsString('Content-Security-Policy', $bridge);
        $this->assertStringContainsString('sha256-', $bridge);
        $this->assertStringNotContainsString("frame-ancestors 'none'", $bridge);
    }
    public function test_only_manifest_assets_are_served_with_bridge_policy_kept_separate(): void
    {
        if (!is_file(resource_path('mobile-web/assets.json'))) {
            foreach (['/app/__vibyra/transport.html', '/app/.env', '/app/index.php'] as $path) {
                $this->get($path)->assertNotFound();
            }
            return;
        }
        $response = $this->get('/app/__vibyra/transport.html')->assertOk()->assertHeader('X-Frame-Options', 'SAMEORIGIN');
        $this->assertStringContainsString('sha256-', $response->headers->get('Content-Security-Policy'));
        $this->assertStringContainsString("frame-ancestors 'self'", $response->headers->get('Content-Security-Policy'));
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
        foreach (['/app/.env', '/app/../../.env', '/app/%2e%2e/%2e%2e/.env', '/app/index.php'] as $path) {
            $this->get($path)->assertNotFound();
        }
        $assets = json_decode(file_get_contents(resource_path('mobile-web/assets.json')), true);
        $js = array_key_first(array_filter($assets, fn ($entry) => $entry['mime'] === 'text/javascript'));
        $this->get('/app/'.$js)->assertOk()->assertHeader('Content-Type', 'text/javascript; charset=utf-8');
        $this->withHeader('If-None-Match', '"'.$assets[$js]['sha256'].'"')->get('/app/'.$js)->assertStatus(304);
    }


    protected function setUp(): void
    {
        parent::setUp();
        config(['web_client.enabled' => true]);
    }

    public function test_web_client_is_off_by_default_and_answers_404_everywhere(): void
    {
        config(['web_client.enabled' => false]);
        foreach (['/app', '/app/', '/app/index.html', '/app/__vibyra/transport.html'] as $path) $this->get($path)->assertNotFound();
        $this->assertFalse((bool) (require base_path('config/web_client.php'))['enabled']);
    }

    public function test_policy_names_only_this_origin_and_the_configured_api_origin(): void
    {
        config(['web_client.api_origin' => 'https://api.example.test']);
        $this->assertStringContainsString("connect-src 'self' https://api.example.test;", $this->get('/app')->headers->get('Content-Security-Policy'));
        config(['web_client.api_origin' => 'http://insecure.example.test']);
        $this->assertStringContainsString("connect-src 'self';", $this->get('/app')->headers->get('Content-Security-Policy'));
        $this->get('/app')->assertHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
    }

    public function test_content_hashed_files_are_cached_for_good_and_the_rest_revalidate(): void
    {
        $assets = json_decode(file_get_contents(resource_path('mobile-web/assets.json')), true);
        $js = array_key_first(array_filter($assets, fn ($entry, $path) => $entry['mime'] === 'text/javascript' && str_contains($path, 'index-'), ARRAY_FILTER_USE_BOTH));
        $this->assertStringContainsString('immutable', $this->get('/app/'.$js)->headers->get('Cache-Control'));
        $this->assertStringNotContainsString('immutable', $this->get('/app/metadata.json')->headers->get('Cache-Control'));
    }

}
