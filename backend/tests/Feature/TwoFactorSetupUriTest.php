<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * The otpauth link names Vibyra as the issuer, so an authenticator app files the
 * code under the product rather than under the framework it happens to run on.
 */
class TwoFactorSetupUriTest extends TestCase
{
    use RefreshDatabase;

    public function test_setup_uri_names_vibyra_as_the_issuer(): void
    {
        Notification::fake();
        config(['app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        $token = $this->postJson('/api/auth/signup', [
            'email' => 'issuer@example.com', 'password' => 'secret123', 'deviceName' => 'iPhone',
        ])->assertSuccessful()->json('token');

        $uri = $this->postJson('/api/account/2fa/start', [], ['Authorization' => "Bearer {$token}"])
            ->assertOk()->json('uri');

        $this->assertStringStartsWith('otpauth://totp/Vibyra:', $uri);
        $this->assertStringContainsString('issuer=Vibyra', $uri);
        $this->assertStringNotContainsString('Laravel', $uri);
    }

    public function test_a_deploy_without_app_name_still_says_vibyra(): void
    {
        // Production had APP_NAME unset and shipped "Laravel" as the issuer; the
        // config default is the last line of defence, so it is asserted directly.
        $this->assertStringContainsString("env('APP_NAME', 'Vibyra')", file_get_contents(config_path('app.php')));
    }
}
