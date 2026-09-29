<?php

namespace Tests\Feature;

use App\Http\Middleware\SecurityHeaders;
use Illuminate\Http\Request;
use Tests\TestCase;

class CloudSecurityHeadersTest extends TestCase
{
    public function test_https_health_has_security_headers(): void
    {
        $this->get('https://localhost/up')->assertOk()
            ->assertHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('X-Frame-Options', 'SAMEORIGIN');
    }

    public function test_explicit_sandbox_policy_is_not_replaced(): void
    {
        $response = (new SecurityHeaders)->handle(Request::create('https://localhost/demo'),
            fn () => response('demo', 200, ['Content-Security-Policy' => "sandbox; default-src 'none'",
                'X-Frame-Options' => 'DENY', 'X-Powered-By' => 'PHP']));
        $this->assertSame("sandbox; default-src 'none'", $response->headers->get('Content-Security-Policy'));
        $this->assertSame('DENY', $response->headers->get('X-Frame-Options'));
        $this->assertFalse($response->headers->has('X-Powered-By'));
    }
}
