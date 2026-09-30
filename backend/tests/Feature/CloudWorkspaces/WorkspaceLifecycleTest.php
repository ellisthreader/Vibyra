<?php
namespace Tests\Feature\CloudWorkspaces;

use App\Services\CloudWorkspaces\{Access, Artifacts, Meter, Runtime, Shutdown, Workspaces};
use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\{Crypt, DB};
use Illuminate\Support\Str;

class WorkspaceLifecycleTest extends CloudTestCase
{
    public function test_start_bootstrap_meter_stop_and_exact_wallet_release(): void
    {
        $id = $this->imported(); $start = $this->start($id);
        $this->assertSame('3000', app(Wallet::class)->payload($this->user->id)['heldUnits']);
        DB::table('cloud_workspaces')->where('id', $id)->update(['machine_id' => 'machine']);
        $w = app(Workspaces::class)->owned($this->user->id, $id);
        $b = app(Runtime::class)->bootstrap($id, Crypt::decryptString($w->bootstrap_secret), 'machine', 1);
        $runtime = app(Runtime::class)->authenticate($id, $b['token']);
        $lease = app(Runtime::class)->heartbeat($runtime, true);
        $this->assertFalse($lease['stop']);
        $this->travel(12)->seconds();
        app(Shutdown::class)->request($this->user->id, $id);
        app(Shutdown::class)->confirm(app(Workspaces::class)->owned($this->user->id, $id));
        $this->assertSame('400', app(Workspaces::class)->payload(app(Workspaces::class)->owned($this->user->id, $id))['runtimeChargedUnits']);
        $this->assertSame('0', app(Wallet::class)->payload($this->user->id)['heldUnits']);
        $this->assertSame(2999600, app(Wallet::class)->available($this->user->id));
        $receipt = DB::table('cloud_reservations')->where('workspace_id', $id)->first();
        $this->assertSame(12, (int) $receipt->billed_seconds);
        $this->assertSame(120000, (int) $receipt->units_per_hour);
        $this->assertNotNull($receipt->tariff_version);
        $this->assertNotNull($receipt->metered_from);
        $this->assertNotNull($receipt->metered_to);
        app(Shutdown::class)->confirm($w);
        $this->assertSame(2999600, app(Wallet::class)->available($this->user->id));
    }
    public function test_boot_failure_returns_all_runtime_hold(): void
    {
        $id = $this->imported(); $this->start($id);
        app(Shutdown::class)->request($this->user->id, $id, 'boot_failed');
        app(Shutdown::class)->confirm(app(Workspaces::class)->owned($this->user->id, $id));
        $this->assertSame(3000000, app(Wallet::class)->available($this->user->id));
    }
    public function test_tampered_secret_paths_and_cross_account_are_refused(): void
    {
        $id = $this->imported();
        foreach (['../secret', '.env', 'x/.ssh/key', '/root/key', 'node_modules/x', '.npmrc', 'x/.netrc', '.pypirc', '.cloud-control/x'] as $path) {
            try { app(Artifacts::class)->validate([['path' => $path, 'content' => base64_encode('x'), 'sha256' => hash('sha256', 'x')]]); $this->fail($path); }
            catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(422, $e->getStatusCode()); }
        }
        $this->withToken('wrong')->getJson('/api/cloud-workspaces/'.$id)->assertUnauthorized();
        $this->withToken('cloud-test')->postJson('/api/cloud-workspaces/'.$id.'/actions', [
            'id' => (string) Str::uuid(), 'operation' => 'read_file', 'arguments' => ['path' => 'app.txt']])->assertForbidden();
    }
    public function test_read_only_session_cannot_authorize_commands_that_can_write(): void
    {
        $id = $this->imported();
        $this->postJson('/api/cloud-workspaces/'.$id.'/quote', ['revision' => 1, 'deviceId' => $this->device->uuid,
            'model' => 'test/model', 'budgetUnits' => 500000, 'seconds' => 3600, 'canWrite' => false, 'commands' => ['npm test']])->assertStatus(422);
        $this->assertSame(0, DB::table('cloud_quotes')->where('workspace_id', $id)->count());
    }
    public function test_directory_case_collisions_are_refused_before_upload(): void
    {
        $files = array_map(fn ($path) => ['path' => $path, 'content' => '', 'sha256' => hash('sha256', '')], ['Source/a', 'source/b']);
        try { app(Artifacts::class)->validate($files); $this->fail('Directory aliases cannot be returned safely to a Mac'); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(422, $e->getStatusCode()); }
    }
    public function test_start_retry_requires_original_possession_proof_and_never_reserves_twice(): void
    {
        $id = $this->imported();
        $q = $this->postJson('/api/cloud-workspaces/'.$id.'/quote', ['revision' => 1, 'deviceId' => $this->device->uuid,
            'model' => 'test/model', 'budgetUnits' => 500000, 'seconds' => 3600, 'canWrite' => true, 'commands' => []])->assertOk()->json('quote');
        $proof = base64_encode(sodium_crypto_box_seal_open(base64_decode($q['challenge']['ciphertext']), $this->keys));
        $body = ['quoteId' => $q['id'], 'proof' => $proof, 'consent' => true];
        $this->postJson('/api/cloud-workspaces/'.$id.'/start', $body)->assertStatus(202);
        $this->postJson('/api/cloud-workspaces/'.$id.'/start', [...$body, 'proof' => base64_encode(random_bytes(32))])->assertForbidden();
        $this->postJson('/api/cloud-workspaces/'.$id.'/start', $body)->assertStatus(202);
        $this->assertSame(1, DB::table('cloud_reservations')->where('workspace_id', $id)->count());
        $this->assertSame('3000', app(Wallet::class)->payload($this->user->id)['heldUnits']);
    }
    public function test_startup_admission_limits_boot_cost_even_before_customer_metering(): void
    {
        config(['cloud_workspaces.starts_per_global_day' => 0]);
        $id = $this->imported();
        $q = $this->postJson('/api/cloud-workspaces/'.$id.'/quote', ['revision' => 1, 'deviceId' => $this->device->uuid,
            'model' => 'test/model', 'budgetUnits' => 500000, 'seconds' => 3600, 'canWrite' => true, 'commands' => []])->assertOk()->json('quote');
        $proof = base64_encode(sodium_crypto_box_seal_open(base64_decode($q['challenge']['ciphertext']), $this->keys));
        $this->postJson('/api/cloud-workspaces/'.$id.'/start', ['quoteId' => $q['id'], 'proof' => $proof, 'consent' => true])->assertStatus(503);
        $this->assertSame('0', app(Wallet::class)->payload($this->user->id)['heldUnits']);
        $this->assertSame('stopped', DB::table('cloud_workspaces')->where('id', $id)->value('state'));
    }
}
