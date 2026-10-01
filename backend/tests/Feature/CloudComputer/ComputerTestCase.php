<?php
namespace Tests\Feature\CloudComputer;

use App\Services\CloudWorkspaces\{CloudWorkspaceProvider, Runtime, Shutdown};
use Illuminate\Support\Facades\{Crypt, DB, Http};
use Illuminate\Support\Str;
use Tests\Feature\CloudWorkspaces\CloudTestCase;

/** Cloud computer fixtures on top of the hosted-workspace fixtures (Pro account, phone session, fake storage). */
abstract class ComputerTestCase extends CloudTestCase
{
    protected string $cid;
    protected string $hostKeys;
    protected string $hostId;
    public object $provider;

    protected function setUp(): void
    {
        parent::setUp();
        config(['remote.relay_url' => 'wss://relay.vibyra.test', 'remote.relay_secret' => 'relay-test-secret-that-is-long-enough-0123456789',
            'vibes.remote_access_live' => true]);
        Http::fake(fn ($request) => Http::response(['ok' => true]));
        $this->provider = new class implements CloudWorkspaceProvider {
            public array $calls = []; public bool $stopped = false;
            public function configure(object $w): array { $this->calls[] = 'configure'; return ['machine' => 'machine', 'volume' => 'volume']; }
            public function recover(object $w): ?array { return null; }
            public function inspect(object $w): string { return $this->stopped ? 'stopped' : 'started'; }
            public function stop(object $w): void { $this->calls[] = 'stop'; $this->stopped = true; }
            public function destroy(object $w): void { $this->calls[] = 'destroy'; }
        };
        $this->app->instance(CloudWorkspaceProvider::class, $this->provider);
        $this->hostKeys = sodium_crypto_box_keypair();
        $this->hostId = bin2hex(sodium_crypto_box_publickey($this->hostKeys));
        $this->cid = (string) Str::uuid();
    }

    protected function createComputer(): array
    {
        return $this->postJson('/api/cloud-computer', ['id' => $this->cid, 'name' => 'My cloud'])->assertOk()->json();
    }

    protected function wake(bool $terms = true): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/cloud-computer/wake', ['acceptTerms' => $terms]);
    }

    /** Wakes, boots (fake provider), bootstraps and heartbeats ready. Returns the runtime bearer. */
    protected function computerReady(?string $id = null): string
    {
        $id ??= $this->cid;
        if (!DB::table('cloud_workspaces')->where('id', $id)->exists()) $this->createComputer();
        $this->wake()->assertStatus(202);
        DB::table('cloud_workspaces')->where('id', $id)->update(['machine_id' => 'machine']);
        $w = DB::table('cloud_workspaces')->where('id', $id)->first();
        $runtime = app(Runtime::class);
        $boot = $runtime->bootstrap($id, Crypt::decryptString($w->bootstrap_secret), 'machine', $w->generation);
        $runtime->heartbeat($runtime->authenticate($id, $boot['token']), true);
        return $boot['token'];
    }

    protected function asRuntime(string $token, string $method, string $path, array $body = []): \Illuminate\Testing\TestResponse
    {
        $response = $this->withToken($token)->{$method.'Json'}('/api/cloud-runtime/'.$this->cid.'/'.$path, $body);
        $this->withToken('cloud-test');
        return $response;
    }

    /** challenge + register as the VM Host with its own key; returns [response, challenge]. */
    protected function registerHost(string $token, bool $wantTrusted = true, ?string $keys = null): \Illuminate\Testing\TestResponse
    {
        $keys ??= $this->hostKeys; $hostId = bin2hex(sodium_crypto_box_publickey($keys));
        $challenge = $this->asRuntime($token, 'post', 'host/challenge', ['hostId' => $hostId])->assertOk()->json();
        $proof = sodium_crypto_box_seal_open(base64_decode($challenge['ciphertext']), $keys);
        return $this->asRuntime($token, 'post', 'host/register', ['hostId' => $hostId, 'name' => 'Cloud computer', 'platform' => 'linux',
            'version' => '0.1.0', 'challengeId' => $challenge['challengeId'], 'proof' => base64_encode($proof), 'wantTrusted' => $wantTrusted]);
    }

    protected function row(): object
    {
        return DB::table('cloud_workspaces')->where('id', $this->cid)->first();
    }

    protected function sleepNow(): void
    {
        app(Shutdown::class)->request($this->user->id, $this->cid);
        app(Shutdown::class)->confirm($this->row());
    }
}
