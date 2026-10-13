<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Account\AccountDeletion;
use App\Services\Account\AppleRevocationQueue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Feature\Support\AppleDeletionFixtures;
use Tests\TestCase;

class AppleAccountDeletionTest extends TestCase
{
    use RefreshDatabase, AppleDeletionFixtures;

    protected function setUp(): void
    {
        parent::setUp();
        $this->appleSetup();
    }

    public function test_native_code_is_bound_to_account_and_revoked_only_after_local_deletion(): void
    {
        [$user, $token] = $this->appleUser();
        $proof = $this->appleProof();
        Http::fake(function ($request) use ($user, $proof) {
            if ($request->url() === 'https://apple.test/keys') return Http::response(['keys' => [$this->appleJwk]]);
            $this->assertSame('app.vibyra.mobile', $request['client_id']);
            $this->assertSame('synthetic-native-secret', $request['client_secret']);
            if ($request->url() === 'https://appleid.apple.com/auth/token') {
                $this->assertDatabaseHas('users', ['id' => $user->id]);
                $this->assertSame('synthetic-one-use-code', $request['code']);
                return Http::response(['id_token' => $this->appleJwt($proof['nonce']),
                    'refresh_token' => 'synthetic-refresh-to-revoke']);
            }
            $this->assertSame('https://appleid.apple.com/auth/revoke', $request->url());
            $this->assertDatabaseMissing('users', ['id' => $user->id]);
            $this->assertSame('synthetic-refresh-to-revoke', $request['token']);
            $this->assertSame('refresh_token', $request['token_type_hint']);
            return Http::response([]);
        });
        $this->withToken($token)->deleteJson('/api/account', $proof)->assertOk()
            ->assertExactJson(['ok' => true, 'cleanupPending' => false, 'appleRevocation' => 'complete']);
        $this->assertDatabaseHas('apple_account_revocations', ['user_id' => $user->id,
            'status' => 'complete', 'payload' => null]);
        $this->assertTrue(app(AppleRevocationQueue::class)->process($user->id));
        Http::assertSentCount(3);
    }

    public function test_failed_revoke_keeps_only_encrypted_material_then_scheduler_erases_it_on_success(): void
    {
        [$user, $token] = $this->appleUser();
        $proof = $this->appleProof();
        $this->appleHttp($proof['nonce'], 503);
        $response = $this->withToken($token)->deleteJson('/api/account', $proof)->assertOk()
            ->assertJsonPath('appleRevocation', 'pending')->assertJsonPath('cleanupPending', true);
        $this->assertDatabaseMissing('users', ['id' => $user->id]);
        $row = DB::table('apple_account_revocations')->where('user_id', $user->id)->first();
        $this->assertStringNotContainsString('synthetic-refresh', $row->payload);
        $this->assertStringNotContainsString('synthetic-refresh', $response->getContent());
        $payload = json_decode(Crypt::decryptString($row->payload), true);
        $this->assertSame('synthetic-refresh-to-revoke', $payload['token']);
        $this->assertSame('apple_revocation_pending', $row->last_error);
        Http::swap(new \Illuminate\Http\Client\Factory());
        Http::preventStrayRequests();
        Http::fake(['https://appleid.apple.com/auth/revoke' => Http::response([])]);
        $this->travel(2)->minutes();
        $this->artisan('vibyra:revoke-deleted-apple-accounts')->assertSuccessful();
        $this->assertDatabaseHas('apple_account_revocations', ['user_id' => $user->id,
            'status' => 'complete', 'payload' => null]);
        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/auth/token'));
    }

    public function test_legacy_deletion_without_code_is_allowed_but_never_claims_revocation(): void
    {
        [$user, $token] = $this->appleUser();
        $proof = $this->appleProof();
        unset($proof['authorizationCode']);
        $this->appleHttp($proof['nonce']);
        $this->withToken($token)->deleteJson('/api/account', $proof)->assertOk()
            ->assertJsonPath('appleRevocation', 'manual')->assertJsonPath('cleanupPending', true);
        $this->assertDatabaseMissing('users', ['id' => $user->id]);
        $this->assertDatabaseHas('apple_account_revocations', ['user_id' => $user->id,
            'status' => 'manual', 'payload' => null]);
        Http::assertSentCount(1);
    }

    public function test_ambiguous_single_use_code_exchange_is_not_retried_or_used_to_block_deletion(): void
    {
        [$user, $token] = $this->appleUser();
        $proof = $this->appleProof();
        Http::fake(['https://apple.test/keys' => Http::response(['keys' => [$this->appleJwk]]),
            'https://appleid.apple.com/auth/token' => Http::failedConnection()]);
        $this->withToken($token)->deleteJson('/api/account', $proof)->assertOk()
            ->assertJsonPath('appleRevocation', 'manual');
        $this->assertDatabaseMissing('users', ['id' => $user->id]);
        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/auth/revoke'));
    }

    public function test_failed_local_deletion_rolls_back_durable_token_and_never_revokes_apple(): void
    {
        [$user, $token] = $this->appleUser();
        $proof = $this->appleProof();
        $this->appleHttp($proof['nonce']);
        User::deleting(fn () => false);
        $this->withToken($token)->deleteJson('/api/account', $proof)->assertStatus(500);
        $this->assertDatabaseHas('users', ['id' => $user->id]);
        $this->assertDatabaseMissing('apple_account_revocations', ['user_id' => $user->id]);
        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/auth/revoke'));
    }
}
