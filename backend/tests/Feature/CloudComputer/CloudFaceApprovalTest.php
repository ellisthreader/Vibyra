<?php
namespace Tests\Feature\CloudComputer;

use Illuminate\Support\Facades\DB;

/** With CLOUD_FACE_APPROVAL on, Apple's Face ID sheet approves a phone for the account's own cloud computer. */
class CloudFaceApprovalTest extends ComputerTestCase
{
    private string $phoneKeys;
    private string $faceKeys;

    protected function setUp(): void
    {
        parent::setUp();
        config(['cloud_workspaces.face_approval' => true]);
        DB::table('passkey_credentials')->update(['revoked_at' => now()]); // a Mac-less phone has no passkey
        DB::table('remote_strong_auth')->delete();
        $this->phoneKeys = sodium_crypto_box_keypair();
        $this->faceKeys = sodium_crypto_box_keypair();
    }

    private function cloudHost(): string
    {
        $token = $this->computerReady();
        $this->registerHost($token)->assertOk();
        DB::table('remote_hosts')->where('host_id', $this->hostId)->update(['online_until' => now()->addMinute()]);
        return $this->hostId;
    }

    private function pending(string $hostId): array
    {
        return $this->postJson('/api/security/devices/register', ['hostId' => $hostId, 'publicKey' => bin2hex(sodium_crypto_box_publickey($this->phoneKeys)),
            'deviceName' => 'iPhone', 'permissions' => ['terminal:access']])->assertOk()->json('device');
    }

    private function face(?string $keys = null): array
    {
        $c = $this->postJson('/api/cloud-computer/face-challenge')->assertOk()->json();
        $proof = sodium_crypto_box_seal_open(base64_decode($c['ciphertext']), $keys ?? $this->faceKeys);
        return ['id' => $c['id'], 'proof' => base64_encode($proof === false ? random_bytes(32) : $proof)];
    }

    private function approve(string $host, string $device, array $face)
    {
        return $this->postJson('/api/remote/hosts/'.$host.'/devices/'.$device.'/decision', ['decision' => 'approve', 'face' => $face]);
    }

    private function connect(string $host, string $device)
    {
        $c = $this->postJson('/api/security/devices/'.$device.'/challenge', ['purpose' => 'connect', 'permissions' => ['terminal:access']]);
        if ($c->status() !== 200) return $c;
        $proof = base64_encode(sodium_crypto_box_seal_open(base64_decode($c->json('ciphertext')), $this->phoneKeys));
        return $this->postJson('/api/remote/hosts/'.$host.'/connect', ['clientName' => 'iPhone', 'deviceId' => $device, 'challengeId' => $c->json('challengeId'),
            'proof' => $proof, 'permissions' => ['terminal:access']]);
    }

    public function test_face_id_approves_the_phone_and_covers_the_connect(): void
    {
        $host = $this->cloudHost();
        $this->postJson('/api/cloud-computer/face-key', ['publicKey' => bin2hex(sodium_crypto_box_publickey($this->faceKeys))])->assertOk();
        $device = $this->pending($host);
        $this->approve($host, $device['id'], $this->face())->assertOk();
        $row = DB::table('trusted_devices')->where('uuid', $device['id'])->first();
        $this->assertNotNull($row->approved_at);
        $this->assertSame('cloud_face', $row->approved_via);
        $this->connect($host, $device['id'])->assertOk();
    }

    public function test_a_wrong_face_key_or_the_switch_off_refuses(): void
    {
        $host = $this->cloudHost();
        $this->postJson('/api/cloud-computer/face-key', ['publicKey' => bin2hex(sodium_crypto_box_publickey($this->faceKeys))])->assertOk();
        $device = $this->pending($host);
        $this->approve($host, $device['id'], $this->face(sodium_crypto_box_keypair()))->assertStatus(403);
        config(['cloud_workspaces.face_approval' => false]);
        $this->approve($host, $device['id'], $this->face())->assertStatus(403)->assertJsonPath('code', 'cloud_passkey_required');
        $this->assertNull(DB::table('trusted_devices')->where('uuid', $device['id'])->value('approved_at'));
    }

    public function test_a_mac_never_takes_a_face_approval(): void
    {
        // The fixture's Mac host is not bound to a cloud computer, so a face body never stands in for the Mac's own approval.
        $mac = DB::table('remote_hosts')->where('host_id', str_repeat('a', 64))->value('host_id');
        $this->postJson('/api/cloud-computer/face-key', ['publicKey' => bin2hex(sodium_crypto_box_publickey($this->faceKeys))])->assertOk();
        $device = $this->pending($mac);
        $this->approve($mac, $device['id'], $this->face())->assertStatus(422);
        $this->assertNull(DB::table('trusted_devices')->where('uuid', $device['id'])->value('approved_at'));
    }
}
