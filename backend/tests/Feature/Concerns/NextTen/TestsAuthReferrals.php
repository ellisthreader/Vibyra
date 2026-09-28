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

trait TestsAuthReferrals
{
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
