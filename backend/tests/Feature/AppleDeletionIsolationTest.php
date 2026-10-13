<?php

namespace Tests\Feature;

use App\Services\Account\AccountDeletion;
use App\Services\Account\AppleRevocationQueue;
use App\Services\Account\AppleAccountRevocation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\Support\AppleDeletionFixtures;
use Tests\TestCase;

class AppleDeletionIsolationTest extends TestCase
{
    use RefreshDatabase, AppleDeletionFixtures;

    protected function setUp(): void
    {
        parent::setUp();
        $this->appleSetup();
    }

    public static function mismatches(): array
    {
        return ['subject' => [['sub' => 'another-apple-user']], 'nonce' => [['nonce' => 'another-nonce']],
            'other-configured-client' => [['aud' => 'vibyra.web']], 'issuer' => [['iss' => 'https://attacker.test']]];
    }

    #[DataProvider('mismatches')]
    public function test_exchanged_token_must_match_fresh_proof_subject_nonce_issuer_and_native_audience(array $claims): void
    {
        [$user, $token] = $this->appleUser();
        $proof = $this->appleProof();
        $this->appleHttp($proof['nonce'], 200, $claims);
        $this->withToken($token)->deleteJson('/api/account', $proof)->assertUnauthorized();
        $this->assertDatabaseHas('users', ['id' => $user->id]);
        $this->assertDatabaseMissing('apple_account_revocations', ['user_id' => $user->id]);
        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/auth/revoke'));
    }

    public function test_different_proof_account_is_rejected_before_any_code_exchange(): void
    {
        [$user, $token] = $this->appleUser();
        $proof = $this->appleProof();
        $proof['identityToken'] = $this->appleJwt($proof['nonce'], ['sub' => 'someone-else']);
        $this->appleHttp($proof['nonce']);
        $this->withToken($token)->deleteJson('/api/account', $proof)->assertForbidden();
        $this->assertDatabaseHas('users', ['id' => $user->id]);
        Http::assertSentCount(1);
    }

    public function test_retry_cannot_send_captured_token_to_a_different_client(): void
    {
        [$user, $token] = $this->appleUser();
        $proof = $this->appleProof();
        $this->appleHttp($proof['nonce'], 503);
        $this->withToken($token)->deleteJson('/api/account', $proof)->assertOk();
        config(['services.apple_native_oauth.client_id' => 'different-app']);
        Http::swap(new \Illuminate\Http\Client\Factory());
        Http::fake();
        $this->assertFalse(app(AppleRevocationQueue::class)->process($user->id));
        Http::assertNothingSent();
        $this->assertDatabaseHas('apple_account_revocations', ['user_id' => $user->id,
            'status' => 'pending']);
    }

    public function test_lost_revoke_acknowledgement_cannot_resurrect_a_concurrent_success(): void
    {
        [$user, $token] = $this->appleUser();
        $proof = $this->appleProof();
        $this->appleHttp($proof['nonce'], 503);
        $this->withToken($token)->deleteJson('/api/account', $proof)->assertOk();
        Http::swap(new \Illuminate\Http\Client\Factory());
        Http::preventStrayRequests();
        Http::fake(['https://appleid.apple.com/auth/revoke' => function () use ($user) {
            DB::table('apple_account_revocations')->where('user_id', $user->id)
                ->update(['payload' => null, 'status' => 'complete']);
            return Http::response([], 503);
        }]);
        $this->assertTrue(app(AppleRevocationQueue::class)->process($user->id));
        $this->assertDatabaseHas('apple_account_revocations', ['user_id' => $user->id,
            'status' => 'complete', 'payload' => null]);
    }

    public function test_malformed_or_tampered_cleanup_material_never_reaches_apple(): void
    {
        Http::fake();
        foreach (['plain-token', Crypt::encryptString('{}'), Crypt::encryptString('null'),
            Crypt::encryptString('{"kind":"external","token":"secret"}')] as $payload) {
            $this->assertFalse(app(AppleAccountRevocation::class)->revoke($payload));
        }
        Http::assertNothingSent();
    }
    public function test_outer_transaction_rollback_never_revokes_apple_or_leaves_an_outbox(): void
    {
        [$user, $token] = $this->appleUser();
        $proof = $this->appleProof();
        $this->appleHttp($proof['nonce']);
        DB::beginTransaction();
        $this->withToken($token)->deleteJson('/api/account', $proof)->assertOk()->assertJsonPath('appleRevocation', 'pending');
        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/auth/revoke'));
        DB::rollBack();
        $this->assertDatabaseHas('users', ['id' => $user->id]);
        $this->assertDatabaseMissing('apple_account_revocations', ['user_id' => $user->id]);
    }

    public function test_outer_transaction_commit_delivers_revocation_only_after_commit(): void
    {
        [$user, $token] = $this->appleUser();
        $proof = $this->appleProof();
        $this->appleHttp($proof['nonce']);
        DB::beginTransaction();
        $this->withToken($token)->deleteJson('/api/account', $proof)->assertOk()->assertJsonPath('appleRevocation', 'pending');
        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/auth/revoke'));
        DB::commit();
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/auth/revoke'));
        $this->assertDatabaseHas('apple_account_revocations', ['user_id' => $user->id, 'status' => 'complete', 'payload' => null]);
    }
}
