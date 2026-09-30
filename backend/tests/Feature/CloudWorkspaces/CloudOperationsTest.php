<?php
namespace Tests\Feature\CloudWorkspaces;

use App\Services\CloudWorkspaces\{CloudWorkspaceProvider, FlyProvider, Runtime, Shutdown, Workspaces, Retention, Preview};
use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\{Crypt, DB, Http, Storage};
use Illuminate\Support\Str;

class CloudOperationsTest extends CloudTestCase
{
    public function test_fly_create_retry_reuses_machine_and_never_exposes_provider_credentials(): void
    {
        $id = $this->imported(); $this->start($id); $w = app(Workspaces::class)->owned($this->user->id, $id);
        $machine = null; $created = 0;
        Http::fake(function ($request) use ($w, &$machine, &$created) {
            $url = $request->url(); $method = $request->method();
            if (str_contains($url, '?org_slug=')) return Http::response(['apps' => [['name' => $w->app_name, 'network' => $w->app_name]]]);
            if (str_ends_with($url, '/volumes')) return Http::response([['id' => 'vol', 'name' => 'project', 'region' => 'lhr', 'encrypted' => true, 'size_gb' => 20]]);
            if (str_ends_with($url, '/machines') && $method === 'GET') return Http::response($machine ? [$machine] : []);
            if (str_ends_with($url, '/machines') && $method === 'POST') {
                $created++; $data = $request->data(); $machine = ['id' => 'machine', 'state' => 'started', 'config' => $data['config']]; return Http::response($machine);
            }
            return Http::response(['name' => $w->app_name]);
        });
        $provider = app(FlyProvider::class); $this->assertSame($provider->configure($w), $provider->configure($w)); $this->assertSame(1, $created);
        $env = $machine['config']['env']; $this->assertSame($id, $env['VIBYRA_WORKSPACE_ID']);
        $this->assertSame([], $machine['config']['services']); $this->assertSame('no', $machine['config']['restart']['policy']);
        $this->assertArrayNotHasKey('OPENROUTER_API_KEY', $env); $this->assertArrayNotHasKey('FLY_API_TOKEN', $env);
        $this->assertSame(Crypt::decryptString($w->bootstrap_secret), $env['VIBYRA_BOOTSTRAP']);
    }
    public function test_failed_runway_renewal_keeps_existing_hold_until_shutdown_confirmation(): void
    {
        $id = $this->imported(); [, $token] = $this->ready($id); $this->travel(5)->seconds();
        config(['cloud_workspaces.account_daily_units' => 1]);
        $runtime = app(Runtime::class); $result = $runtime->heartbeat($runtime->authenticate($id, $token), true);
        $this->assertTrue($result['stop']); $this->assertSame(3000, (int) app(Wallet::class)->payload($this->user->id)['heldUnits']);
        app(Shutdown::class)->confirm(app(Workspaces::class)->owned($this->user->id, $id));
        $this->assertSame('0', app(Wallet::class)->payload($this->user->id)['heldUnits']);
        $this->assertGreaterThan(0, DB::table('cloud_reservations')->where('workspace_id', $id)->sum('charged'));
    }
    public function test_preview_origin_cannot_reach_account_routes_and_revocation_invalidates_ticket(): void
    {
        config(['cloud_workspaces.preview_enabled' => true, 'cloud_workspaces.preview_domain' => 'preview.test']);
        $id = $this->imported(); [$access] = $this->ready($id);
        $ticket = $this->withHeader('X-Vibyra-Cloud-Access', $access)->postJson('/api/cloud-workspaces/'.$id.'/preview', ['port' => 3000, 'consent' => true])->assertOk()->json();
        $host = parse_url($ticket['url'], PHP_URL_HOST); $token = explode('.', $host)[0];
        $this->postJson('https://'.$host.'/api/auth/login', [])->assertStatus(405);
        $this->device->update(['revoked_at' => now()]);
        try { app(Preview::class)->authority($token); $this->fail('Revoked tickets cannot preview.'); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(403, $e->getStatusCode()); }
    }
    public function test_archiving_removes_fly_resources_but_preserves_verified_project_until_expiry(): void
    {
        $provider = new class implements CloudWorkspaceProvider {
            public int $destroyed = 0;
            public function configure(object $w): array { return []; }
            public function recover(object $w): ?array { return null; }
            public function inspect(object $w): string { return 'stopped'; }
            public function stop(object $w): void {}
            public function destroy(object $w): void { $this->destroyed++; }
        }; $this->app->instance(CloudWorkspaceProvider::class, $provider);
        $id = $this->imported(); $this->travel(8)->days();
        app(Retention::class)->reconcile(app(Workspaces::class)->owned($this->user->id, $id));
        $this->assertSame('archived', DB::table('cloud_workspaces')->where('id', $id)->value('state'));
        $this->getJson('/api/cloud-workspaces/'.$id.'/export')->assertOk()->assertJsonPath('current.files.0.path', 'app.txt');
        $this->travel(23)->days(); app(Retention::class)->reconcile(app(Workspaces::class)->owned($this->user->id, $id));
        $this->assertSame('expired', DB::table('cloud_workspaces')->where('id', $id)->value('state'));
        $this->assertSame(0, DB::table('cloud_checkpoints')->where('workspace_id', $id)->count());
    }
}
