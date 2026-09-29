<?php

namespace Tests\Feature;

use App\Models\{RemoteHost, User, VibyraSession};
use App\Services\Remote\Passkeys\{PasskeyCeremonies, WebAuthnVerifier};
use App\Services\Remote\RemoteAccessException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Support\RemotePasskeyFixture;
use Tests\TestCase;

class RemotePasskeysTest extends TestCase
{
    use RefreshDatabase;
    private VibyraSession $session;
    private int $device;
    private RemotePasskeyFixture $authenticator;

    protected function setUp(): void
    {
        parent::setUp();
        config(['remote_security.origin' => 'https://remote.test', 'remote_security.rp_id' => 'remote.test']);
        $user = User::factory()->create();
        $this->session = VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'phone'),
            'idle_expires_at' => now()->addHour(), 'absolute_expires_at' => now()->addDay()]);
        $host = RemoteHost::create(['user_id' => $user->id, 'host_id' => str_repeat('a', 64), 'name' => 'Mac', 'remote_access_mode' => 'ask', 'authorization_generation' => 1, 'registered_at' => now()]);
        $this->device = DB::table('trusted_devices')->insertGetId(['user_id' => $user->id, 'remote_host_id' => $host->id,
            'uuid' => (string) Str::uuid(), 'public_key' => str_repeat('b', 64), 'device_name' => 'Phone',
            'authorization_generation' => 1, 'pairing_code' => '123456', 'request_expires_at' => now()->addMinutes(5),
            'permissions' => '["terminal:access"]', 'approved_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        $this->authenticator = new RemotePasskeyFixture();
    }

    private function flow(string $purpose = 'register'): array
    {
        $flow = app(PasskeyCeremonies::class)->begin($this->session, $this->device, $purpose);
        parse_str(parse_url($flow['url'], PHP_URL_FRAGMENT), $ticket);
        $row = DB::table('remote_passkey_ceremonies')->where('id', $flow['id'])->first();
        return [$flow['id'], $ticket['secret'], base64_decode($row->challenge)];
    }

    private function register(): void
    {
        [$id, $secret, $challenge] = $this->flow();
        app(PasskeyCeremonies::class)->finish($id, $secret, $this->authenticator->register($challenge));
    }

    public function test_real_es256_passkey_registers_and_step_up_is_device_and_session_bound(): void
    {
        $this->register();
        $this->assertDatabaseCount('passkey_credentials', 1);
        [$id, $secret, $challenge] = $this->flow('authenticate');
        $options = app(PasskeyCeremonies::class)->options($id, $secret);
        $this->assertSame('required', $options['options']['publicKey']['userVerification']);
        app(PasskeyCeremonies::class)->finish($id, $secret, $this->authenticator->authenticate($challenge));
        $this->assertSame('verified', app(PasskeyCeremonies::class)->status($this->session, $id)['status']);
        $this->assertDatabaseHas('remote_strong_auth', ['app_session_id' => $this->session->id, 'trusted_device_id' => $this->device]);
        $this->assertDatabaseHas('passkey_credentials', ['counter' => 1]);
        $this->expectException(RemoteAccessException::class);
        app(PasskeyCeremonies::class)->finish($id, $secret, $this->authenticator->authenticate($challenge));
    }

    public function test_no_user_verification_wrong_origin_and_replayed_failures_are_denied(): void
    {
        foreach ([['https://remote.test', 0x41], ['https://evil.remote.test', 0x45]] as [$origin, $flags]) {
            [$id, $secret, $challenge] = $this->flow();
            try { app(PasskeyCeremonies::class)->finish($id, $secret, $this->authenticator->register($challenge, $origin, $flags)); $this->fail('Invalid credential accepted'); }
            catch (RemoteAccessException $error) { $this->assertSame(422, $error->status); }
            $this->assertDatabaseCount('passkey_credentials', 0);
            $this->assertNotNull(DB::table('remote_passkey_ceremonies')->where('id', $id)->value('consumed_at'));
            try { app(PasskeyCeremonies::class)->finish($id, $secret, $this->authenticator->register($challenge)); $this->fail('Replayed failure accepted'); }
            catch (RemoteAccessException $error) { $this->assertSame(403, $error->status); }
        }
    }

    public function test_modified_signature_and_counter_rollback_are_denied(): void
    {
        $this->register();
        [$id, $secret, $challenge] = $this->flow('authenticate');
        app(PasskeyCeremonies::class)->finish($id, $secret, $this->authenticator->authenticate($challenge, 2));
        foreach ([false, true] as $modified) {
            [$id, $secret, $challenge] = $this->flow('authenticate');
            $assertion = $this->authenticator->authenticate($challenge, $modified ? 3 : 1);
            if ($modified) $assertion['response']['signature'] = WebAuthnVerifier::encode(random_bytes(64));
            try { app(PasskeyCeremonies::class)->finish($id, $secret, $assertion); $this->fail('Invalid assertion accepted'); }
            catch (RemoteAccessException $error) { $this->assertSame(422, $error->status); }
        }
        $this->assertDatabaseHas('passkey_credentials', ['counter' => 2]);
    }

    public function test_revoked_device_and_expired_challenge_cannot_step_up(): void
    {
        [$id, $secret, $challenge] = $this->flow();
        DB::table('trusted_devices')->where('id', $this->device)->update(['revoked_at' => now()]);
        try { app(PasskeyCeremonies::class)->finish($id, $secret, $this->authenticator->register($challenge)); $this->fail('Revoked device accepted'); }
        catch (RemoteAccessException $error) { $this->assertSame(403, $error->status); }
        DB::table('trusted_devices')->where('id', $this->device)->update(['revoked_at' => null]);
        [$id, $secret, $challenge] = $this->flow();
        $this->travel(301)->seconds();
        $this->expectException(RemoteAccessException::class);
        app(PasskeyCeremonies::class)->finish($id, $secret, $this->authenticator->register($challenge));
    }

    public function test_unapproved_device_cannot_enroll_and_other_session_cannot_poll(): void
    {
        [$id] = $this->flow();
        $other = VibyraSession::create(['user_id' => $this->session->user_id, 'token_hash' => hash('sha256', 'other'),
            'idle_expires_at' => now()->addHour(), 'absolute_expires_at' => now()->addDay()]);
        try { app(PasskeyCeremonies::class)->status($other, $id); $this->fail('Other session polled'); }
        catch (RemoteAccessException $error) { $this->assertSame(404, $error->status); }
        DB::table('trusted_devices')->where('id', $this->device)->update(['approved_at' => null]);
        $this->expectException(RemoteAccessException::class);
        $this->flow();
    }
    public function test_passkey_removal_is_owned_and_invalidates_strong_authentication(): void
    {
        $this->register();
        $id = DB::table('passkey_credentials')->value('id');
        $other = User::factory()->create();
        VibyraSession::create(['user_id' => $other->id, 'token_hash' => hash('sha256', 'other-user'),
            'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addDay()]);
        $this->deleteJson('/api/security/passkeys/'.$id, [], ['Authorization' => 'Bearer other-user'])->assertNotFound();
        $this->assertDatabaseCount('remote_strong_auth', 1);
        $this->deleteJson('/api/security/passkeys/'.$id, [], ['Authorization' => 'Bearer phone'])->assertOk();
        $this->assertDatabaseCount('remote_strong_auth', 0);
        $this->assertNotNull(DB::table('passkey_credentials')->where('id', $id)->value('revoked_at'));
        $this->assertDatabaseHas('security_events', ['event_type' => 'PASSKEY_REMOVED', 'user_id' => $this->session->user_id]);
    }

    public function test_consumed_assertion_cannot_restore_step_up_after_account_security_change(): void
    {
        [$id, , $challenge] = $this->flow();
        DB::table('remote_passkey_ceremonies')->where('id', $id)->update(['consumed_at' => now()]);
        $flow = DB::table('remote_passkey_ceremonies')->where('id', $id)->first();
        app(\App\Services\Remote\RemoteAccountSecurity::class)->revoke($this->session->user_id);
        try { app(\App\Services\Remote\Passkeys\PasskeyVerification::class)->complete($flow, $this->authenticator->register($challenge)); $this->fail('Invalidated in-flight assertion accepted'); }
        catch (RemoteAccessException $error) { $this->assertSame(403, $error->status); }
        $this->assertDatabaseCount('remote_strong_auth', 0);
        $this->assertDatabaseCount('passkey_credentials', 0);
    }

    public function test_p256_leading_zero_coordinate_registers_and_authenticates(): void
    {
        // Known test-only scalar 43 has a Y coordinate beginning with 0x00.
        // OpenSSL can return that coordinate as 31 bytes; COSE requires 32.
        $der = hex2bin('30310201010420').str_pad(pack('N', 43), 32, "\0", STR_PAD_LEFT).hex2bin('a00a06082a8648ce3d030107');
        $pem = "-----BEGIN EC PRIVATE KEY-----\n".chunk_split(base64_encode($der), 64, "\n")."-----END EC PRIVATE KEY-----\n";
        $key = openssl_pkey_get_private($pem);
        $this->assertSame("\0", str_pad(openssl_pkey_get_details($key)['ec']['y'], 32, "\0", STR_PAD_LEFT)[0]);
        $this->authenticator = new RemotePasskeyFixture($key);
        $this->register();
        [$id, $secret, $challenge] = $this->flow('authenticate');
        app(PasskeyCeremonies::class)->finish($id, $secret, $this->authenticator->authenticate($challenge));
        $this->assertSame('verified', app(PasskeyCeremonies::class)->status($this->session, $id)['status']);
        $this->assertDatabaseHas('passkey_credentials', ['counter' => 1]);
    }

}
