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

trait TestsAuthSessionManagement
{
    public function test_account_sessions_can_be_listed_revoked_and_cleared(): void
        {
            $this->app->instance(\App\Services\SessionLocationResolver::class, new class {
                public function labelForIp(string $ip): string
                {
                    return $ip === '127.0.0.1' ? 'Local network' : 'London, United Kingdom';
                }
            });

            $signup = $this->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
                ->withHeader('User-Agent', 'Vibyra Desktop Test')
                ->postJson('/api/auth/signup', [
                    'name' => 'Session Owner',
                    'email' => 'sessions@example.com',
                    'password' => 'secret123',
                    'deviceName' => 'Vibyra Desktop',
                    'installId' => 'desktop-install-1',
                ])
                ->assertCreated();
            $desktopToken = $signup->json('token');

            $this->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
                ->withHeader('User-Agent', 'Vibyra Desktop Test')
                ->postJson('/api/auth/login', [
                    'email' => 'sessions@example.com',
                    'password' => 'secret123',
                    'deviceName' => 'Vibyra Desktop',
                    'installId' => 'desktop-install-1',
                ])
                ->assertOk();

            $appToken = $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.24'])
                ->withHeader('User-Agent', 'Vibyra App Test')
                ->postJson('/api/auth/login', [
                    'email' => 'sessions@example.com',
                    'password' => 'secret123',
                    'deviceName' => 'Vibyra App',
                    'installId' => 'app-install-1',
                ])
                ->assertOk()
                ->json('token');

            $headers = ['Authorization' => "Bearer {$desktopToken}"];
            $response = $this->getJson('/api/account/sessions', $headers)
                ->assertOk()
                ->assertJsonCount(2, 'devices')
                ->assertJsonCount(3, 'sessions')
                ->assertJsonPath('devices.0.current', true);
            $devices = $response->json('devices');

            $appDevice = collect($devices)->firstWhere('deviceName', 'Vibyra App');
            $this->assertNotEmpty($appDevice['id']);
            $this->assertSame('London, United Kingdom', $appDevice['location']);

            $this->deleteJson("/api/account/devices/{$appDevice['id']}", [], $headers)
                ->assertOk()
                ->assertJsonPath('currentRevoked', false);

            $this->getJson('/api/session', ['Authorization' => "Bearer {$appToken}"])
                ->assertUnauthorized();

            $this->deleteJson('/api/account/sessions', [], $headers)
                ->assertOk()
                ->assertJsonPath('currentRevoked', true);

            $this->getJson('/api/session', $headers)
                ->assertUnauthorized();
        }

    public function test_current_session_device_name_can_be_refreshed_for_settings(): void
        {
            $token = $this->postJson('/api/auth/signup', [
                'name' => 'Phone Owner',
                'email' => 'phone-device@example.com',
                'password' => 'secret123',
                'deviceName' => 'Vibyra App',
                'installId' => 'phone-install-1',
            ])->assertCreated()->json('token');

            $headers = ['Authorization' => "Bearer {$token}"];

            $this->postJson('/api/account/session/device', [
                'deviceName' => "Ellis's iPhone",
                'installId' => 'phone-install-1',
            ], $headers)
                ->assertOk()
                ->assertJsonPath('device.deviceName', "Ellis's iPhone")
                ->assertJsonPath('device.current', true);

            $this->getJson('/api/account/sessions', $headers)
                ->assertOk()
                ->assertJsonCount(1, 'devices')
                ->assertJsonPath('devices.0.deviceName', "Ellis's iPhone");
        }

    public function test_local_desktop_session_can_use_forwarded_public_ip_for_location(): void
        {
            $this->app->instance(\App\Services\SessionLocationResolver::class, new class {
                public function labelForIp(string $ip): string
                {
                    return $ip === '8.8.8.8' ? 'Mountain View, United States' : 'Local network';
                }
            });

            $token = $this->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
                ->postJson('/api/auth/signup', [
                    'name' => 'Local Desktop',
                    'email' => 'local-desktop@example.com',
                    'password' => 'secret123',
                    'deviceName' => 'ThinkPad',
                    'installId' => 'desktop-local-install',
                    'publicIp' => '8.8.8.8',
                ])
                ->assertCreated()
                ->json('token');

            $headers = [
                'Authorization' => "Bearer {$token}",
                'X-Vibyra-Public-IP' => '8.8.8.8',
            ];

            $this->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
                ->getJson('/api/session', $headers)
                ->assertOk();

            $this->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
                ->getJson('/api/account/sessions', $headers)
                ->assertOk()
                ->assertJsonPath('devices.0.location', 'Mountain View, United States');
        }
}
