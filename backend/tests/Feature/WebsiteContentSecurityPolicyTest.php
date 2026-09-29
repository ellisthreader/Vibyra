<?php

namespace Tests\Feature;

use App\Http\Middleware\SecurityHeaders;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Vite;
use Tests\TestCase;

class WebsiteContentSecurityPolicyTest extends TestCase
{
    public function test_nonce_is_unique_per_request_and_only_trusted_tags_receive_it(): void
    {
        $nonces = [];
        foreach ([1, 2] as $_) {
            $request = Request::create('https://localhost');
            $response = (new SecurityHeaders)->handle($request, function () use ($request) {
                $nonce = $request->attributes->get('vibyra.csp_nonce');
                $this->assertSame($nonce, Vite::cspNonce());
                return response('<script>untrusted()</script>');
            });
            $nonce = $request->attributes->get('vibyra.csp_nonce');
            $this->assertSame(32, strlen(base64_decode($nonce, true)));
            $this->assertStringContainsString("'nonce-{$nonce}'", $response->headers->get('Content-Security-Policy'));
            $this->assertSame('<script>untrusted()</script>', $response->getContent());
            $nonces[] = $nonce;
        }
        $this->assertNotSame($nonces[0], $nonces[1]);
    }

    public function test_public_routes_have_script_policy_and_legal_style_nonce(): void
    {
        $this->withoutMiddleware(\App\Http\Middleware\RecordWebsiteView::class);
        foreach (['/', '/login', '/signup', '/downloads', '/billing', '/legal/privacy', '/legal/terms'] as $path) {
            $response = $this->get($path)->assertOk();
            $csp = $response->headers->get('Content-Security-Policy');
            $this->assertMatchesRegularExpression("/script-src 'self' 'nonce-[A-Za-z0-9+\/=]+'/", $csp);
            $this->assertStringContainsString("script-src-attr 'none'", $csp);
            $this->assertStringNotContainsString('unsafe-eval', $csp);
            $this->assertStringNotContainsString('https:', preg_replace('#https://challenges.cloudflare.com#', '', $csp));
            if (str_contains($path, 'legal/') || $path === '/legal/terms') {
                preg_match("/'nonce-([^']+)'/", $csp, $match);
                $response->assertSee('nonce="'.$match[1].'"', false);
            }
        }
    }

    public function test_production_turnstile_bootstrap_and_callback_are_explicitly_nonced(): void
    {
        config(['services.turnstile.enabled' => true, 'services.turnstile.site_key' => 'test-site', 'services.turnstile.secret_key' => 'test-secret']);
        $response = $this->get('/login')->assertForbidden();
        preg_match("/'nonce-([^']+)'/", $response->headers->get('Content-Security-Policy'), $match);
        $this->assertCount(2, $match);
        $this->assertSame(3, substr_count($response->getContent(), 'nonce="'.$match[1].'"'));
        $response->assertSee('https://challenges.cloudflare.com/turnstile/v0/api.js', false);
    }

    public function test_third_party_redirects_do_not_require_wide_script_or_frame_permissions(): void
    {
        $request = Request::create('https://localhost');
        $response = (new SecurityHeaders)->handle($request, fn () => response('website'));
        $csp = $response->headers->get('Content-Security-Policy');
        $this->assertStringContainsString('https://challenges.cloudflare.com', $csp);
        $this->assertStringContainsString("connect-src 'self' https://challenges.cloudflare.com", $csp);
        $this->assertStringContainsString("form-action 'self'", $csp);
        foreach (['stripe.com', 'google.com', 'apple.com', 'localhost:5173', 'unsafe-eval'] as $absent) {
            $this->assertStringNotContainsString($absent, $csp);
        }
    }

    public function test_strict_passkey_policy_is_preserved(): void
    {
        $this->get('/remote/verify')->assertOk()->assertHeader('Content-Security-Policy',
            "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    }

    public function test_nonce_owned_html_cannot_be_cached_but_existing_preview_policies_keep_their_cache(): void
    {
        $request = Request::create('https://localhost');
        $headers = ['Content-Type' => 'text/html', 'Cache-Control' => 'public, max-age=3600', 'ETag' => 'old-html'];
        $response = (new SecurityHeaders)->handle($request, fn () => response('trusted template', 200, $headers));
        $this->assertTrue($response->headers->hasCacheControlDirective('no-store'));
        $this->assertTrue($response->headers->hasCacheControlDirective('private'));
        $this->assertFalse($response->headers->has('ETag'));
        $headers['Content-Security-Policy'] = "default-src 'none'";
        $preview = (new SecurityHeaders)->handle($request, fn () => response('separate preview', 200, $headers));
        $this->assertSame("default-src 'none'", $preview->headers->get('Content-Security-Policy'));
        $this->assertTrue($preview->headers->hasCacheControlDirective('public'));
        $this->assertSame('old-html', $preview->headers->get('ETag'));
    }
}
