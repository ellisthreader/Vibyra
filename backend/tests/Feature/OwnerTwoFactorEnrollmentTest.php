<?php

namespace Tests\Feature;

use App\Http\Middleware\LocalOwnerAccess;
use App\Models\User;
use App\Services\Auth\ProviderEnrollmentProof;
use App\Services\Auth\DesktopProviderOAuthFlow;
use App\Services\Auth\ProviderIdentityException;
use App\Services\Auth\Totp;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OwnerTwoFactorEnrollmentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'app.key' => 'base64:'.base64_encode(str_repeat('x', 32)),
            'owner_analytics.emails' => ['owner@example.test', 'other@example.test', 'emailowner@example.test'],
            'services.google_desktop_oauth.client_id' => 'google-test-client',
            'services.google_desktop_oauth.redirect_uri' => 'https://example.test/google/callback',
            'services.google_desktop_oauth.authorize_url' => 'https://accounts.google.com/o/oauth2/v2/auth',
        ]);
        $this->withCredentials();
    }

    private function owner(string $email = 'owner@example.test'): User
    {
        return User::factory()->create(['email' => $email, 'email_verified_at' => now(),
            'provider' => 'google', 'provider_id' => 'google-'.$email]);
    }

    public function test_owner_google_check_is_session_bound_and_local_test_owner_cannot_enroll(): void
    {
        $this->postJson('/web-api/owner/2fa/provider/start', ['provider' => 'google'])->assertUnauthorized();
        $this->actingAs(User::factory()->create(['email' => LocalOwnerAccess::EMAIL,
            'email_verified_at' => now(), 'provider' => 'local_owner']))
            ->postJson('/web-api/owner/2fa/provider/start', ['provider' => 'google'])->assertForbidden();

        $owner = $this->owner();
        $this->actingAs($owner);
        $flow = $this->postJson('/web-api/owner/2fa/provider/start', ['provider' => 'google'])
            ->assertOk()->assertHeader('Cache-Control', 'no-store, private')->json();
        $originalSession = request()->session()->getId();
        $this->withCookie(config('session.cookie'), $originalSession);
        $this->assertStringContainsString('accounts.google.com', $flow['authUrl']);
        $this->getJson('/web-api/owner/2fa/provider/status/'.$flow['flowId'])
            ->assertOk()->assertJsonPath('status', 'pending');
        $this->getJson('/web-api/auth/provider/google/status/'.$flow['flowId'])->assertForbidden();
        $this->withCookie(config('session.cookie'), 'another-browser-session')
            ->getJson('/web-api/owner/2fa/provider/status/'.$flow['flowId'])->assertForbidden();
        $this->withCookie(config('session.cookie'), $originalSession);

        $this->actingAs($this->owner('other@example.test'))
            ->getJson('/web-api/owner/2fa/provider/status/'.$flow['flowId'])->assertForbidden();
        $this->actingAs($owner)
            ->getJson('/web-api/owner/2fa/provider/status/'.$flow['flowId'])
            ->assertOk()->assertJsonPath('status', 'pending');
    }

    public function test_one_use_provider_proof_then_totp_and_separate_owner_step_up(): void
    {
        $owner = $this->owner();
        $this->actingAs($owner);
        $this->postJson('/web-api/owner/2fa/confirm', ['code' => '123456'])->assertForbidden();
        $this->withCookie(config('session.cookie'), request()->session()->getId());
        $this->postJson('/web-api/owner/2fa/start', ['enrollmentProof' => str_repeat('a', 64)])
            ->assertForbidden();
        $proof = app(ProviderEnrollmentProof::class)->issue([
            'accountId' => $owner->id, 'providerSubject' => $owner->provider_id,
            'sessionType' => 'web', 'sessionId' => request()->session()->getId(),
        ], 'google', ['subject' => $owner->provider_id]);
        $started = $this->postJson('/web-api/owner/2fa/start', ['enrollmentProof' => $proof])
            ->assertOk()->assertHeader('Cache-Control', 'no-store, private')->json();
        $this->postJson('/web-api/owner/2fa/start', ['enrollmentProof' => $proof])->assertForbidden();
        $totp = app(Totp::class);
        $code = $totp->at($totp->decode($started['secret']), intdiv(time(), Totp::PERIOD));
        $confirmed = $this->postJson('/web-api/owner/2fa/confirm', ['code' => $code])
            ->assertOk()->assertJsonPath('enabled', true)->json();
        $this->assertCount(10, $confirmed['recoveryCodes']);
        $this->postJson('/web-api/owner/2fa/confirm', ['code' => $code])->assertForbidden();
        $this->getJson('/web-api/owner/accounts')->assertStatus(428)->assertJsonPath('enabled', true);
        $this->postJson('/web-api/owner/verify-2fa', ['code' => $confirmed['recoveryCodes'][0]])
            ->assertOk();
        $this->getJson('/web-api/owner/accounts')->assertOk()
            ->assertDontSee($confirmed['recoveryCodes'][1]);
    }

    public function test_failed_google_check_can_retry_without_issuing_a_setup_proof(): void
    {
        $this->actingAs($this->owner());
        $flow = $this->postJson('/web-api/owner/2fa/provider/start', ['provider' => 'google'])
            ->assertOk()->json();
        $this->withCookie(config('session.cookie'), request()->session()->getId());
        app(DesktopProviderOAuthFlow::class)->finish($flow['flowId'], [
            'ok' => false, 'status' => 'failed', 'error' => 'Google account check was cancelled.',
        ]);
        $this->getJson('/web-api/owner/2fa/provider/status/'.$flow['flowId'])
            ->assertOk()->assertJsonPath('status', 'failed')->assertJsonMissingPath('enrollmentProof');
        $retry = $this->postJson('/web-api/owner/2fa/provider/start', ['provider' => 'google'])
            ->assertOk()->json();
        $this->assertNotSame($flow['flowId'], $retry['flowId']);
        $this->getJson('/web-api/owner/2fa/provider/status/'.$retry['flowId'])
            ->assertOk()->assertJsonPath('status', 'pending');
    }

    public function test_subject_mismatch_and_expired_setup_cannot_enable_totp(): void
    {
        $owner = $this->owner();
        $this->actingAs($owner);
        $this->getJson('/web-api/owner/accounts')->assertStatus(428);
        $this->withCookie(config('session.cookie'), request()->session()->getId());
        try {
            app(ProviderEnrollmentProof::class)->issue([
                'accountId' => $owner->id, 'providerSubject' => $owner->provider_id,
                'sessionType' => 'web', 'sessionId' => request()->session()->getId(),
            ], 'google', ['subject' => 'someone-else']);
            $this->fail('A mismatched Google subject must be rejected.');
        } catch (ProviderIdentityException) {
            $this->assertTrue(true);
        }
        $proof = app(ProviderEnrollmentProof::class)->issue([
            'accountId' => $owner->id, 'providerSubject' => $owner->provider_id,
            'sessionType' => 'web', 'sessionId' => request()->session()->getId(),
        ], 'google', ['subject' => $owner->provider_id]);
        $this->postJson('/web-api/owner/2fa/start', ['enrollmentProof' => $proof])->assertOk();
        $this->travel(11)->minutes();
        $this->postJson('/web-api/owner/2fa/confirm', ['code' => '123456'])->assertForbidden();
        $this->assertNull($owner->fresh()->two_factor_confirmed_at);
    }

    public function test_email_owner_keeps_existing_authenticator_enrollment_path(): void
    {
        $this->actingAs(User::factory()->create(['email' => 'emailowner@example.test',
            'email_verified_at' => now(), 'provider' => 'email']))
            ->getJson('/web-api/owner/accounts')->assertStatus(428)
            ->assertJsonPath('enabled', false)->assertJsonPath('provider', 'email');
        $this->postJson('/web-api/owner/2fa/provider/start', ['provider' => 'google'])
            ->assertForbidden();
    }
}
