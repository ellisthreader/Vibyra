<?php
namespace Tests\Feature\CloudWorkspaces;

use App\Models\{User, VibyraSession, RemoteHost, TrustedDevice};
use App\Services\Membership\{Enrollment, Periods};
use App\Services\Vibes\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, DB, Queue, Storage};
use Illuminate\Support\Str;
use Tests\TestCase;

abstract class CloudTestCase extends TestCase
{
    use RefreshDatabase;
    protected User $user;
    protected VibyraSession $session;
    protected TrustedDevice $device;
    protected string $keys;
    protected function setUp(): void
    {
        parent::setUp();
        config(['cloud_workspaces.enabled' => true, 'cloud_workspaces.starts_enabled' => true, 'cloud_workspaces.ai_enabled' => true,
            'cloud_workspaces.provider_audit_required' => false,
            'cloud_workspaces.units_per_hour' => 120000, 'cloud_workspaces.provider_micro_per_hour' => 91700,
            'cloud_workspaces.tariff_version' => 'test-v1', 'cloud_workspaces.daily_micro_limit' => 100000000,
            'cloud_workspaces.fly_token' => 'test', 'cloud_workspaces.fly_org' => 'test',
            'cloud_workspaces.image' => 'registry.test/runtime@sha256:'.str_repeat('a', 64), 'cloud_workspaces.api_origin' => 'https://test.example',
            'cloud_workspaces.lease_private_key' => base64_encode(sodium_crypto_sign_secretkey(sodium_crypto_sign_keypair())),
            'vibes.enabled' => true, 'vibes.funded_terminals_enabled' => true, 'services.openrouter.key' => 'test']);
        Storage::fake('cloud-workspaces'); Queue::fake();
        $this->user = User::factory()->create(['email_verified_at' => now(), 'credits_balance' => 0]);
        app(Wallet::class)->ensure($this->user, 0); app(Enrollment::class)->migrate($this->user, 0);
        app(Periods::class)->grant($this->user->id, ['reference' => 'cloud:test', 'provider' => 'stripe', 'environment' => 'test',
            'subscription_id' => 'sub', 'payment_id' => 'pay', 'offer_key' => 'pro_monthly', 'starts_at' => now(),
            'ends_at' => now()->addMonth(), 'units' => 3000000, 'paid_minor' => 1999, 'currency' => 'GBP']);
        DB::table('vibes_wallets')->where('user_id', $this->user->id)->update(['consented_at' => now()]);
        $this->session = VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', 'cloud-test'),
            'device_name' => 'phone', 'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addMonth()]);
        $host = RemoteHost::create(['user_id' => $this->user->id, 'host_id' => str_repeat('a', 64), 'name' => 'Mac',
            'registered_at' => now(), 'authorization_generation' => 1, 'remote_access_mode' => 'enabled']);
        $this->keys = sodium_crypto_box_keypair();
        $this->device = TrustedDevice::create(['uuid' => (string) Str::uuid(), 'user_id' => $this->user->id,
            'remote_host_id' => $host->id, 'authorization_generation' => 1,
            'public_key' => bin2hex(sodium_crypto_box_publickey($this->keys)), 'device_name' => 'Phone',
            'permissions' => ['files.read', 'files.write'], 'pairing_code' => '123456', 'request_expires_at' => now()->addMinute(), 'approved_at' => now()]);
        $passkey = DB::table('passkey_credentials')->insertGetId(['user_id' => $this->user->id, 'credential_hash' => str_repeat('b', 64),
            'credential_id' => 'test', 'public_key' => 'test', 'device_name' => 'Phone', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('remote_strong_auth')->insert(['app_session_id' => $this->session->id, 'trusted_device_id' => $this->device->id,
            'passkey_credential_id' => $passkey, 'verified_at' => now(), 'expires_at' => now()->addMinutes(5)]);
        Cache::put(config('billing.openrouter_pricing.cache_key'), ['synced_at' => now()->toIso8601String(), 'models' => [
            'test/model' => ['pricing' => ['prompt' => '0.0000001', 'completion' => '0.0000002'], 'supported_parameters' => ['tools'], 'output_modalities' => ['text']]]]);
        $this->withToken('cloud-test');
    }
    protected function imported(): string
    {
        $id = (string) Str::uuid();
        $this->postJson('/api/cloud-workspaces', ['id' => $id, 'name' => 'Cloud test', 'projectId' => 'test'])->assertOk();
        $this->postJson('/api/cloud-workspaces/'.$id.'/import', ['revision' => 0, 'consent' => true,
            'files' => [['path' => 'app.txt', 'content' => base64_encode('hello'), 'sha256' => hash('sha256', 'hello')]]])->assertOk();
        return $id;
    }
    protected function start(string $id): array
    {
        $q = $this->postJson('/api/cloud-workspaces/'.$id.'/quote', ['revision' => 1, 'deviceId' => $this->device->uuid,
            'model' => 'test/model', 'budgetUnits' => 500000, 'seconds' => 3600, 'canWrite' => true, 'commands' => ['npm test']])->assertOk()->json('quote');
        $challenge = $q['challenge'];
        $proof = sodium_crypto_box_seal_open(base64_decode($challenge['ciphertext']), $this->keys);
        return $this->postJson('/api/cloud-workspaces/'.$id.'/start', ['quoteId' => $q['id'], 'proof' => base64_encode($proof), 'consent' => true])->assertStatus(202)->json();
    }
    protected function ready(string $id): array
    {
        $start = $this->start($id);
        DB::table('cloud_workspaces')->where('id', $id)->update(['machine_id' => 'machine']);
        $w = app(\App\Services\CloudWorkspaces\Workspaces::class)->owned($this->user->id, $id);
        $runtime = app(\App\Services\CloudWorkspaces\Runtime::class);
        $boot = $runtime->bootstrap($id, \Illuminate\Support\Facades\Crypt::decryptString($w->bootstrap_secret), 'machine', 1);
        $runtime->heartbeat($runtime->authenticate($id, $boot['token']), true);
        return [$start['access'], $boot['token']];
    }
}
