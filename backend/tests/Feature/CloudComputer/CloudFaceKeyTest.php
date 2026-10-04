<?php
namespace Tests\Feature\CloudComputer;

use App\Models\VibyraSession;
use Illuminate\Support\Facades\DB;

/** "Connect to cloud" needs Face ID on the phone: a key registered right after sign-in, and a challenge only it can open. */
class CloudFaceKeyTest extends SyncTestCase
{
    private string $faceKeys;

    protected function setUp(): void
    {
        parent::setUp();
        DB::table('cloud_connect_consents')->delete();
        $this->faceKeys = sodium_crypto_box_keypair();
    }

    private function enroll(?string $keys = null): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/cloud-computer/face-key', ['publicKey' => bin2hex(sodium_crypto_box_publickey($keys ?? $this->faceKeys))]);
    }

    /** What the phone does after Face ID: open the sealed value with the Keychain key. */
    private function answer(?string $keys = null): array
    {
        $c = $this->postJson('/api/cloud-computer/face-challenge')->assertOk()->json();
        return ['id' => $c['id'], 'proof' => base64_encode(sodium_crypto_box_seal_open(base64_decode($c['ciphertext']), $keys ?? $this->faceKeys))];
    }

    private function connect(?array $face): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/cloud-computer/connect', ['accept' => true, 'consentVersion' => (int) config('cloud_workspaces.connect_consent_version')] + ($face ? ['face' => $face] : []));
    }

    public function test_connect_with_face_id_from_this_sign_in_works(): void
    {
        $this->enroll()->assertOk();
        $this->connect($this->answer())->assertOk()->assertJsonPath('connected', true);
    }

    public function test_connect_without_face_id_is_refused_and_nothing_is_kept(): void
    {
        $this->enroll()->assertOk();
        $this->connect(null)->assertStatus(403)->assertJsonPath('code', 'face_required');
        $this->connect(['id' => (string) \Illuminate\Support\Str::uuid(), 'proof' => base64_encode(random_bytes(32))])->assertStatus(403);
        $this->assertSame(0, DB::table('cloud_connect_consents')->count());
        $this->assertSame(0, DB::table('cloud_workspaces')->where('user_id', $this->user->id)->where('kind', 'computer')->count());
    }

    public function test_a_stolen_token_cannot_register_a_key_after_the_sign_in_window(): void
    {
        $this->travel(11)->minutes();
        $this->enroll()->assertStatus(409)->assertJsonPath('code', 'face_sign_in_required');
        $this->postJson('/api/cloud-computer/face-challenge')->assertStatus(409)->assertJsonPath('code', 'face_sign_in_required');
    }

    public function test_one_key_per_sign_in_so_a_thief_cannot_swap_it(): void
    {
        $this->enroll()->assertOk();
        $this->enroll(sodium_crypto_box_keypair())->assertStatus(409)->assertJsonPath('code', 'face_key_exists');
    }

    public function test_the_answer_must_come_from_the_registered_key_and_works_once(): void
    {
        $this->enroll()->assertOk();
        $c = $this->postJson('/api/cloud-computer/face-challenge')->assertOk()->json();
        $this->assertFalse(sodium_crypto_box_seal_open(base64_decode($c['ciphertext']), sodium_crypto_box_keypair()), 'another key cannot open it');
        $good = $this->answer();
        config(['cloud_workspaces.connect_requires_face' => true]);
        $this->connect($good)->assertOk();
        $this->connect($good)->assertStatus(403)->assertJsonPath('code', 'face_required');
    }

    public function test_a_challenge_of_another_session_does_not_count(): void
    {
        $this->enroll()->assertOk();
        $face = $this->answer();
        $other = VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', 'second-phone'), 'device_name' => 'phone',
            'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addMonth()]);
        $this->withToken('second-phone')->postJson('/api/cloud-computer/connect', ['accept' => true, 'consentVersion' => (int) config('cloud_workspaces.connect_consent_version'), 'face' => $face])
            ->assertStatus(403)->assertJsonPath('code', 'face_required');
        $this->assertNotNull($other->id);
    }
}
