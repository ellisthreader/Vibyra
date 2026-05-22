<?php

namespace Tests\Feature;

use App\Services\VibyraDesktopState;
use App\Services\Referrals\ReferralService;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response as GuzzleResponse;
use Tests\TestCase;

class VibyraAuthReferralApiTest extends TestCase
{
    use RefreshDatabase;
    public function test_email_signup_creates_free_account_and_persists_state(): void
    {
        $signup = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex@example.com',
            'password' => 'secret123',
        ]);

        $token = $signup
            ->assertCreated()
            ->assertJsonPath('user.plan', 'free')
            ->assertJsonPath('user.creditsBalance', 50)
            ->json('token');

        $headers = ['Authorization' => "Bearer {$token}"];

        $this->postJson('/api/onboarding/complete', [], $headers)
            ->assertOk()
            ->assertJsonPath('user.onboardingComplete', true);

        $this->postJson('/api/session/state', [
            'rememberedDesktops' => [[
                'url' => 'http://127.0.0.1:4317',
                'pairCode' => 'ABCD12',
                'machineName' => 'Vibyra Desktop',
                'status' => 'online',
            ]],
            'appState' => ['selectedChatModel' => 'gpt-5.4-mini'],
        ], $headers)
            ->assertOk()
            ->assertJsonPath('user.rememberedDesktops.0.pairCode', 'ABCD12');
    }

    public function test_delete_account_requires_password_and_removes_user_session(): void
    {
        $token = $this->postJson("/api/auth/signup", [
            "name" => "Delete Me",
            "email" => "delete-me@example.com",
            "password" => "secret123",
        ])->assertCreated()->json("token");

        $headers = ["Authorization" => "Bearer " . $token];

        $this->deleteJson("/api/account", ["password" => "wrong-password"], $headers)
            ->assertUnauthorized()
            ->assertJsonPath("error", "Password is incorrect.");

        $this->assertDatabaseHas("users", ["email" => "delete-me@example.com"]);

        $this->deleteJson("/api/account", ["password" => "secret123"], $headers)
            ->assertOk()
            ->assertJsonPath("ok", true);

        $this->assertDatabaseMissing("users", ["email" => "delete-me@example.com"]);
        $this->assertSame(0, DB::table("vibyra_sessions")->count());
    }

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

    public function test_referral_signup_grants_invite_code_and_signup_rewards(): void
    {
        $referrerToken = $this->postJson('/api/auth/signup', [
            'name' => 'Sam Referrer',
            'email' => 'sam@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $summary = $this->getJson('/api/referrals/me', ['Authorization' => "Bearer {$referrerToken}"])
            ->assertOk()
            ->assertJsonPath('referral.stats.signedUp', 0)
            ->json('referral');

        $this->postJson('/api/auth/signup', [
            'name' => 'Rae Referred',
            'email' => 'rae@example.com',
            'password' => 'secret123',
            'referralCode' => strtolower($summary['code']),
        ])->assertCreated()
            ->assertJsonPath('user.creditsBalance', 75);

        $this->assertSame(100, (int) User::where('email', 'sam@example.com')->first()->credits_balance);
        $this->assertDatabaseHas('referrals', ['code' => $summary['code']]);
        $this->assertDatabaseHas('credit_ledger', ['kind' => 'referral_signup', 'credits_delta' => 50]);

        $this->getJson('/api/referrals/me', ['Authorization' => "Bearer {$referrerToken}"])
            ->assertOk()
            ->assertJsonPath('referral.stats.signedUp', 1)
            ->assertJsonPath('referral.stats.earnedCredits', 50);
    }

    public function test_referral_paid_conversion_grants_once(): void
    {
        $referrerToken = $this->postJson('/api/auth/signup', [
            'name' => 'Sam Referrer',
            'email' => 'sam-paid@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');
        $code = $this->getJson('/api/referrals/me', ['Authorization' => "Bearer {$referrerToken}"])->json('referral.code');

        $this->postJson('/api/auth/signup', [
            'name' => 'Rae Referred',
            'email' => 'rae-paid@example.com',
            'password' => 'secret123',
            'referralCode' => $code,
        ])->assertCreated();

        $referred = User::where('email', 'rae-paid@example.com')->first();
        app(ReferralService::class)->recordPaidConversion($referred, 'starter', 'test');
        app(ReferralService::class)->recordPaidConversion($referred->fresh(), 'starter', 'test');

        $this->assertSame(250, (int) User::where('email', 'sam-paid@example.com')->first()->credits_balance);
        $this->assertSame(175, (int) $referred->fresh()->credits_balance);
        $this->assertDatabaseCount('referrals', 1);
        $this->assertDatabaseHas('credit_ledger', ['kind' => 'referral_paid', 'credits_delta' => 150]);
        $this->assertDatabaseHas('credit_ledger', ['kind' => 'referral_paid', 'credits_delta' => 100]);

        $this->getJson('/api/referrals/me', ['Authorization' => "Bearer {$referrerToken}"])
            ->assertOk()
            ->assertJsonPath('referral.stats.paid', 1)
            ->assertJsonPath('referral.stats.earnedCredits', 200);
    }

    public function test_invalid_referral_code_does_not_create_account(): void
    {
        $this->postJson('/api/auth/signup', [
            'name' => 'No Invite',
            'email' => 'no-invite@example.com',
            'password' => 'secret123',
            'referralCode' => 'missing-code',
        ])->assertStatus(422);

        $this->assertDatabaseMissing('users', ['email' => 'no-invite@example.com']);
    }
}
