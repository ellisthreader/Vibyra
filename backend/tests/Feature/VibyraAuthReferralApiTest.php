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
