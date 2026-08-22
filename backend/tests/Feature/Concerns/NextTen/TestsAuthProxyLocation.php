<?php

namespace Tests\Feature\Concerns\NextTen;

use App\Services\VibyraDesktopState;
use App\Services\Referrals\ReferralService;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response as GuzzleResponse;

trait TestsAuthProxyLocation
{
    public function test_api_cors_allows_desktop_public_ip_header(): void
        {
            $this->optionsJson('/api/account/sessions')
                ->assertNoContent()
                ->assertHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Vibyra-Public-IP');
        }

    public function test_private_proxy_request_uses_forwarded_public_ip_for_location(): void
        {
            $this->app->instance(\App\Services\SessionLocationResolver::class, new class {
                public function labelForIp(string $ip): string
                {
                    return $ip === '8.8.8.8' ? 'Mountain View, United States' : 'Local network';
                }
            });

            $token = $this->withServerVariables(['REMOTE_ADDR' => '10.10.0.12'])
                ->withHeader('X-Forwarded-For', '8.8.8.8, 10.10.0.12')
                ->postJson('/api/auth/signup', [
                    'name' => 'Proxy Desktop',
                    'email' => 'proxy-desktop@example.com',
                    'password' => 'secret123',
                    'deviceName' => 'Desktop Behind Proxy',
                    'installId' => 'desktop-proxy-install',
                ])
                ->assertCreated()
                ->json('token');

            $this->withServerVariables(['REMOTE_ADDR' => '10.10.0.12'])
                ->withHeader('X-Forwarded-For', '8.8.8.8, 10.10.0.12')
                ->getJson('/api/account/sessions', ['Authorization' => "Bearer {$token}"])
                ->assertOk()
                ->assertJsonPath('devices.0.location', 'Mountain View, United States');
        }

    public function test_public_request_ip_cannot_be_overridden_by_forwarded_header(): void
        {
            $this->app->instance(\App\Services\SessionLocationResolver::class, new class {
                public function labelForIp(string $ip): string
                {
                    return $ip === '1.1.1.1' ? 'Brisbane, Australia' : 'Mountain View, United States';
                }
            });

            $token = $this->withServerVariables(['REMOTE_ADDR' => '1.1.1.1'])
                ->withHeader('X-Forwarded-For', '8.8.8.8')
                ->postJson('/api/auth/signup', [
                    'name' => 'Public Desktop',
                    'email' => 'public-desktop@example.com',
                    'password' => 'secret123',
                    'deviceName' => 'Desktop Public',
                    'installId' => 'desktop-public-install',
                ])
                ->assertCreated()
                ->json('token');

            $this->withServerVariables(['REMOTE_ADDR' => '1.1.1.1'])
                ->withHeader('X-Vibyra-Public-IP', '8.8.8.8')
                ->getJson('/api/account/sessions', ['Authorization' => "Bearer {$token}"])
                ->assertOk()
                ->assertJsonPath('devices.0.location', 'Brisbane, Australia');
        }
}
