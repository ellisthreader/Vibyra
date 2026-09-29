<?php

namespace Tests\Feature;

use App\Jobs\DeliverRemoteSecurityNotification;
use App\Models\{RemoteHost, TrustedDevice, User, VibyraSession};
use App\Services\Notifications\Devices;
use App\Services\Remote\{RemoteAccessException, RemoteDeviceProof, SecurityEvents};
use App\Services\Remote\Passkeys\PasskeyCeremonies;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\TestCase;

class RemoteSecurityConcurrencyTest extends TestCase
{
    use RefreshDatabase;

    private function approved(): array
    {
        Queue::fake();
        config(['remote_security.origin' => 'https://remote.test', 'remote_security.rp_id' => 'remote.test']);
        $session = VibyraSession::create(['user_id' => User::factory()->create()->id, 'token_hash' => hash('sha256', 'phone'),
            'idle_expires_at' => now()->addHour(), 'absolute_expires_at' => now()->addDay()]);
        $host = RemoteHost::create(['user_id' => $session->user_id, 'host_id' => str_repeat('a', 64), 'name' => 'Mac',
            'remote_access_mode' => 'ask', 'authorization_generation' => 1, 'registered_at' => now()]);
        $keys = sodium_crypto_box_keypair();
        $device = TrustedDevice::create(['user_id' => $session->user_id, 'remote_host_id' => $host->id,
            'uuid' => (string) Str::uuid(), 'public_key' => bin2hex(sodium_crypto_box_publickey($keys)), 'device_name' => 'Phone',
            'authorization_generation' => 1, 'pairing_code' => '123456', 'request_expires_at' => now()->addMinutes(5),
            'permissions' => ['terminal:access'], 'approved_at' => now()]);
        return [$session, $device, $keys];
    }

    public function test_failed_ceremony_creation_rolls_back_possession_proof_then_success_consumes_it_once(): void
    {
        [$session, $device, $keys] = $this->approved();
        $challenge = app(RemoteDeviceProof::class)->challenge($session, $device->uuid, 'passkey');
        $data = ['deviceId' => $device->uuid, 'purpose' => 'register', 'challengeId' => $challenge['challengeId'],
            'proof' => base64_encode(sodium_crypto_box_seal_open(base64_decode($challenge['ciphertext']), $keys))];
        $this->mock(PasskeyCeremonies::class)->shouldReceive('begin')->once()->andThrow(new RemoteAccessException('Temporarily unavailable.', 503));
        $this->postJson('/api/security/passkeys/begin', $data, ['Authorization' => 'Bearer phone'])->assertStatus(503);
        $this->assertDatabaseHas('remote_device_challenges', ['id' => $challenge['challengeId'], 'consumed_at' => null]);
        $this->assertDatabaseCount('remote_passkey_ceremonies', 0);
        $this->app->forgetInstance(PasskeyCeremonies::class);
        $this->postJson('/api/security/passkeys/begin', $data, ['Authorization' => 'Bearer phone'])->assertOk();
        $this->postJson('/api/security/passkeys/begin', $data, ['Authorization' => 'Bearer phone'])->assertForbidden();
        $this->assertDatabaseCount('remote_passkey_ceremonies', 1);
    }

    public function test_repeated_invalid_passkey_device_proofs_trigger_a_short_delay(): void
    {
        [$session, $device] = $this->approved();
        $challenge = app(RemoteDeviceProof::class)->challenge($session, $device->uuid, 'passkey');
        $data = ['deviceId' => $device->uuid, 'purpose' => 'register', 'challengeId' => $challenge['challengeId'],
            'proof' => base64_encode(random_bytes(32))];
        for ($attempt = 0; $attempt < 3; $attempt++) {
            $this->postJson('/api/security/passkeys/begin', $data, ['Authorization' => 'Bearer phone'])->assertForbidden();
        }
        $this->postJson('/api/security/passkeys/begin', $data, ['Authorization' => 'Bearer phone'])
            ->assertStatus(429)->assertJsonPath('code', 'remote_verification_delayed');
        $this->assertDatabaseCount('remote_passkey_ceremonies', 0);
    }

    public function test_malformed_proof_and_ceremony_ids_fail_before_uuid_database_lookups(): void
    {
        [$session, $device] = $this->approved();
        $host = $device->host;
        foreach (['', 'not-a-uuid'] as $id) {
            $checks = [
                [403, fn () => app(\App\Services\Remote\RemoteHostSecurityProof::class)->consume($session, $host, 'policy', $host->host_id, ['mode' => 'trusted'], $id, '')],
                [403, fn () => app(RemoteDeviceProof::class)->consumeFor($session, $device, 'passkey', $id, '')],
                [404, fn () => app(RemoteDeviceProof::class)->owned($session, $id)],
                [409, fn () => app(\App\Services\Remote\RemoteIdentityProof::class)->consume($session->user, $session->id, $host->host_id, $host, $id, '')],
                [404, fn () => app(PasskeyCeremonies::class)->status($session, $id)],
                [403, fn () => app(PasskeyCeremonies::class)->options($id, str_repeat('a', 43))],
            ];
            foreach ($checks as [$status, $check]) {
                try { $check(); $this->fail('Malformed UUID was accepted'); }
                catch (RemoteAccessException $error) { $this->assertSame($status, $error->status); }
            }
        }
        // The API-wide OPTIONS route yields 405 when the UUID-constrained GET
        // route does not match; malformed IDs never reach a database lookup.
        $this->getJson('/api/security/passkeys/ceremonies/not-a-uuid', ['Authorization' => 'Bearer phone'])->assertStatus(405);
        foreach (['0', '01', '9223372036854775808', str_repeat('9', 100)] as $id) {
            $this->deleteJson('/api/security/passkeys/'.$id, [], ['Authorization' => 'Bearer phone'])->assertNotFound();
        }
    }

    public function test_uuid_rotated_while_waiting_for_host_lock_cannot_resolve_to_new_pairing(): void
    {
        [$session, $device] = $this->approved();
        $rotated = false; $uuid = $device->uuid;
        DB::listen(function ($query) use (&$rotated, $device, $uuid): void {
            if ($rotated || ! str_starts_with($query->sql, 'select') || ! str_contains($query->sql, 'trusted_devices')
                || ! in_array($uuid, $query->bindings, true)) return;
            $rotated = true;
            // Deterministically model the winning renewal between the unlocked
            // lookup and the locked reread, without depending on SQLite locks.
            DB::table('trusted_devices')->where('id', $device->id)->update(['uuid' => (string) Str::uuid()]);
        });
        try { app(RemoteDeviceProof::class)->challenge($session, $uuid, 'passkey'); $this->fail('Stale request UUID resolved'); }
        catch (RemoteAccessException $error) { $this->assertSame(404, $error->status); }
        $this->assertTrue($rotated);
        $this->assertDatabaseCount('remote_device_challenges', 0);
    }

    public function test_late_failed_worker_cannot_undo_replacement_delivery_acceptance(): void
    {
        [$session] = $this->approved();
        config(['remote_security.email_notifications' => false, 'intelligence.push' => true,
            'intelligence.expo_project' => 'test-project', 'intelligence.environment' => 'test']);
        app(Devices::class)->register($session, ['projectId' => 'test-project', 'environment' => 'test',
            'installation' => (string) Str::uuid(), 'proof' => 'proof', 'token' => 'ExponentPushToken[test]']);
        $event = app(SecurityEvents::class)->record($session->user_id, 'REMOTE_SESSION_STARTED');
        $id = DB::table('security_event_deliveries')->where('security_event_id', $event)->value('id');
        $first = true;
        Http::fake(function () use (&$first, $id) {
            if (! $first) return Http::response(['data' => ['status' => 'ok', 'id' => 'ticket']]);
            $first = false;
            $this->travel(121)->seconds();
            (new DeliverRemoteSecurityNotification($id))->handle();
            throw new \RuntimeException('Late provider failure');
        });
        (new DeliverRemoteSecurityNotification($id))->handle();
        $this->assertDatabaseHas('security_event_deliveries', ['id' => $id, 'status' => 'accepted', 'attempts' => 2]);
        $this->assertNotNull(DB::table('security_event_deliveries')->where('id', $id)->value('accepted_at'));
        (new DeliverRemoteSecurityNotification($id))->handle();
        $this->assertDatabaseHas('security_event_deliveries', ['id' => $id, 'attempts' => 2]);
    }
}
