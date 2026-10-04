<?php
namespace Tests\Feature\CloudComputer;

use App\Models\{User, VibyraSession};
use App\Services\Membership\{Enrollment, Periods};
use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\{DB, Storage};
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;

/** Cloud sync fixtures: a fake sync disk, raw-body uploads as the Mac or the cloud computer, and a second eligible account. */
abstract class SyncTestCase extends ComputerTestCase
{
    protected string $deviceId;
    protected string $macKey;
    protected string $key;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('cloud-sync');
        config(['cloud_workspaces.sync_disk' => 'cloud-sync', 'cloud_workspaces.sync_max_blob_bytes' => 536870912, 'cloud_workspaces.sync_quota_bytes' => 5368709120]);
        $this->deviceId = (string) Str::uuid();
        $this->macKey = str_repeat('a1', 32);
        $this->key = hash('sha256', 'project-one', false); $this->key = substr($this->key, 0, 32);
    }

    protected function sync(string $method, string $path, array $body = [], string $token = 'cloud-test'): TestResponse
    {
        return $this->withToken($token)->{$method.'Json'}('/api/cloud-computer/sync'.$path, $body);
    }

    /** A raw octet-stream request. $uri is a full path (with query). */
    protected function raw(string $method, string $uri, string $content, string $token): TestResponse
    {
        $response = $this->call($method, $uri, [], [], [], ['CONTENT_TYPE' => 'application/octet-stream', 'HTTP_AUTHORIZATION' => 'Bearer '.$token, 'HTTP_ACCEPT' => 'application/json'], $content);
        $this->withToken('cloud-test');
        return $response;
    }

    protected function q(array $over = [], ?string $content = null): array
    {
        $content ??= random_bytes(2048);
        return [$content, array_merge(['kind' => 'code', 'seq' => 1, 'baseSeq' => 0, 'head' => str_repeat('c', 40), 'sha256' => hash('sha256', $content)], $over)];
    }

    protected function up(string $name, array $over = [], ?string $content = null, string $token = 'cloud-test'): TestResponse
    {
        [$content, $q] = $this->q($over, $content);
        return $this->raw('PUT', '/api/cloud-computer/sync/projects/'.$name.'/up?'.http_build_query($q), $content, $token);
    }

    protected function runtimeRaw(string $token, string $method, string $path, string $content = '', ?string $workspace = null): TestResponse
    {
        return $this->raw($method, '/api/cloud-runtime/'.($workspace ?? $this->cid).'/sync/'.$path, $content, $token);
    }

    protected function registerMac(string $token = 'cloud-test', ?string $device = null): array
    {
        $device ??= $this->deviceId;
        return $this->sync('put', '/macs/'.$device, ['publicKey' => $this->macKey, 'name' => 'My Mac'], $token)->assertOk()->json('mac');
    }

    /** The phone's tick (docs/cloud-access-contract.md): nothing syncs until a project is allowed. */
    protected function allowKey(string $key, string $token = 'cloud-test'): void
    {
        $user = DB::table('vibyra_sessions')->where('token_hash', hash('sha256', $token))->value('user_id');
        DB::table('cloud_project_access')->insertOrIgnore(['user_id' => $user, 'project_key' => $key, 'name' => 'Test project', 'allowed' => true, 'source' => 'phone', 'created_at' => now(), 'updated_at' => now()]);
    }

    protected function grant(string $name = 'my-app', ?string $key = null, string $token = 'cloud-test'): array
    {
        $this->allowKey($key ?? $this->key, $token);
        return $this->sync('post', '/projects', ['projectKey' => $key ?? $this->key, 'name' => $name], $token)->assertOk()->json('project');
    }

    protected function otherAccount(): array
    {
        $user = User::factory()->create(['email_verified_at' => now(), 'credits_balance' => 0]);
        app(Wallet::class)->ensure($user, 0); app(Enrollment::class)->migrate($user, 0);
        app(Periods::class)->grant($user->id, ['reference' => 'cloud:other', 'provider' => 'stripe', 'environment' => 'test', 'subscription_id' => 'sub2', 'payment_id' => 'pay2',
            'offer_key' => 'pro_monthly', 'starts_at' => now(), 'ends_at' => now()->addMonth(), 'units' => 3000000, 'paid_minor' => 1999, 'currency' => 'GBP']);
        DB::table('vibes_wallets')->where('user_id', $user->id)->update(['consented_at' => now()]);
        $this->consent($user->id);
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'other-token'), 'device_name' => 'mac', 'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addMonth()]);
        return [$user, 'other-token'];
    }

    /** A ready computer with the VM's key posted. Returns the runtime bearer. */
    protected function vmReady(): string
    {
        $token = $this->computerReady();
        $this->asRuntime($token, 'post', 'sync/key', ['publicKey' => str_repeat('b2', 32)])->assertOk();
        return $token;
    }
}
