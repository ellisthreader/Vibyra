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
    public function test_fly_ignores_a_disk_being_destroyed_and_a_destroyed_predecessor_machine(): void
    {
        $id = $this->imported(); $this->start($id); $w = app(Workspaces::class)->owned($this->user->id, $id);
        $mounted = null;
        Http::fake(function ($request) use ($w, &$mounted) {
            $url = $request->url(); $method = $request->method();
            if (str_contains($url, '?org_slug=')) return Http::response(['apps' => [['name' => $w->app_name, 'network' => $w->app_name]]]);
            if (str_ends_with($url, '/volumes')) return Http::response([
                ['id' => 'old', 'name' => 'project', 'region' => 'lhr', 'state' => 'pending_destroy', 'encrypted' => true, 'size_gb' => 20],
                ['id' => 'vol', 'name' => 'project', 'region' => 'lhr', 'state' => 'created', 'encrypted' => true, 'size_gb' => 20]]);
            if (str_ends_with($url, '/machines') && $method === 'GET') return Http::response([]);
            if (str_ends_with($url, '/machines') && $method === 'POST') {
                $mounted = $request->data()['config']['mounts'][0]['volume']; return Http::response(['id' => 'machine', 'state' => 'created']);
            }
            if (str_ends_with($url, '/machines/stale')) return Http::response(['id' => 'stale', 'state' => 'destroyed',
                'config' => ['metadata' => ['vibyra_workspace' => $w->id, 'vibyra_operation' => 'an-earlier-start', 'vibyra_generation' => '0']]]);
            return Http::response(['name' => $w->app_name]);
        });
        $provider = app(FlyProvider::class);
        $this->assertSame(['machine' => 'machine', 'volume' => 'vol'], $provider->configure($w));
        $this->assertSame('vol', $mounted);
        $this->assertSame('destroyed', $provider->inspect((object) array_merge((array) $w, ['machine_id' => 'stale'])));
    }
    public function test_a_full_fly_server_moves_the_disk_then_starts_on_the_copy(): void
    {
        $id = $this->imported(); $this->start($id); $w = app(Workspaces::class)->owned($this->user->id, $id);
        $volumes = [['id' => 'old', 'name' => 'project', 'region' => 'lhr', 'state' => 'created', 'encrypted' => true, 'size_gb' => 20, 'attached_machine_id' => null]];
        $full = true; $forks = []; $deleted = []; $mounted = null;
        Http::fake(function ($request) use ($w, &$volumes, &$full, &$forks, &$deleted, &$mounted) {
            $url = $request->url(); $method = $request->method();
            if (str_contains($url, '?org_slug=')) return Http::response(['apps' => [['name' => $w->app_name, 'network' => $w->app_name]]]);
            if (str_ends_with($url, '/volumes') && $method === 'GET') return Http::response($volumes);
            if (str_ends_with($url, '/volumes') && $method === 'POST') {
                $forks[] = $request->data(); $copy = ['id' => 'new', 'name' => 'project', 'region' => 'lhr', 'state' => 'hydrating', 'encrypted' => true, 'size_gb' => 20];
                $volumes[] = $copy; return Http::response($copy);
            }
            if (str_contains($url, '/volumes/') && $method === 'DELETE') {
                $gone = basename(parse_url($url, PHP_URL_PATH)); $deleted[] = $gone;
                $volumes = array_map(fn ($v) => $v['id'] === $gone ? ['state' => 'pending_destroy'] + $v : $v, $volumes); return Http::response([]);
            }
            if (str_ends_with($url, '/machines') && $method === 'GET') return Http::response([]);
            if (str_ends_with($url, '/machines') && $method === 'POST') {
                if ($full) return Http::response(['error' => "insufficient resources to create new machine with existing volume 'old'", 'status' => 'volume_placement_capacity'], 412);
                $mounted = $request->data()['config']['mounts'][0]['volume']; return Http::response(['id' => 'machine', 'state' => 'created']);
            }
            return Http::response(['name' => $w->app_name]);
        });
        $provider = app(FlyProvider::class);
        $attempt = function () use ($provider, $w) { try { return $provider->configure($w); } catch (\RuntimeException $e) { return $e->getMessage(); } };
        // Fly is full next to the disk: one copy is requested on another server, and the start retries later.
        $this->assertStringContainsString('moving', $attempt()); $this->assertStringContainsString('moving', $attempt());
        $this->assertCount(1, $forks);
        $this->assertSame(['old', true, 2], [$forks[0]['source_volume_id'], $forks[0]['require_unique_zone'], $forks[0]['compute']['cpus']]);
        // Still copying: no machine yet, nothing deleted.
        $full = false;
        $this->assertStringContainsString('still moving', $attempt()); $this->assertNull($mounted); $this->assertSame([], $deleted);
        // Copied: the original goes and the machine mounts the copy.
        $volumes[1]['state'] = 'created';
        $this->assertSame(['machine' => 'machine', 'volume' => 'new'], $attempt());
        $this->assertSame(['old'], $deleted); $this->assertSame('new', $mounted);
    }
    public function test_two_project_disks_without_a_recorded_move_are_never_removed(): void
    {
        $id = $this->imported(); $this->start($id); $w = app(Workspaces::class)->owned($this->user->id, $id); $deleted = 0;
        Http::fake(function ($request) use ($w, &$deleted) {
            $url = $request->url();
            if (str_contains($url, '?org_slug=')) return Http::response(['apps' => [['name' => $w->app_name, 'network' => $w->app_name]]]);
            if (str_ends_with($url, '/volumes')) return Http::response([
                ['id' => 'a', 'name' => 'project', 'region' => 'lhr', 'state' => 'created', 'encrypted' => true, 'size_gb' => 20],
                ['id' => 'b', 'name' => 'project', 'region' => 'lhr', 'state' => 'created', 'encrypted' => true, 'size_gb' => 20]]);
            if ($request->method() === 'DELETE') $deleted++;
            return Http::response(['name' => $w->app_name]);
        });
        try { app(FlyProvider::class)->configure($w); $this->fail('expected a refusal'); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame('Multiple project disks need reconciliation.', $e->getMessage()); }
        $this->assertSame(0, $deleted);
    }
    /** 2026-10-07: Fly took longer to answer the copy request than the backend waited, but made the copy; every start then
     *  stopped at "Multiple project disks". The intent is now recorded first, and the next start adopts that copy. */
    public function test_a_disk_copy_whose_reply_never_came_is_adopted_on_the_next_start(): void
    {
        $id = $this->imported(); $this->start($id); $w = app(Workspaces::class)->owned($this->user->id, $id);
        $volumes = [['id' => 'old', 'name' => 'project', 'region' => 'lhr', 'state' => 'created', 'encrypted' => true, 'size_gb' => 20,
            'attached_machine_id' => null, 'created_at' => now()->subDay()->toIso8601String()]];
        $copies = 0; $deleted = []; $mounted = null;
        Http::fake(function ($request) use ($w, &$volumes, &$copies, &$deleted, &$mounted) {
            $url = $request->url(); $method = $request->method();
            if (str_contains($url, '?org_slug=')) return Http::response(['apps' => [['name' => $w->app_name, 'network' => $w->app_name]]]);
            if (str_ends_with($url, '/volumes') && $method === 'GET') return Http::response($volumes);
            if (str_ends_with($url, '/volumes') && $method === 'POST') {
                // Fly makes the copy, but the reply is lost.
                $copies++; $volumes[] = ['id' => 'new', 'name' => 'project', 'region' => 'lhr', 'state' => 'created', 'encrypted' => true,
                    'size_gb' => 20, 'attached_machine_id' => null, 'created_at' => now()->toIso8601String()];
                throw new \Illuminate\Http\Client\ConnectionException('Operation timed out');
            }
            if (str_contains($url, '/volumes/') && $method === 'DELETE') { $deleted[] = basename(parse_url($url, PHP_URL_PATH)); return Http::response([]); }
            if (str_ends_with($url, '/machines') && $method === 'GET') return Http::response([]);
            if (str_ends_with($url, '/machines') && $method === 'POST') {
                $volume = $request->data()['config']['mounts'][0]['volume'];
                if ($volume === 'old') return Http::response(['error' => 'insufficient resources', 'status' => 'volume_placement_capacity'], 412);
                $mounted = $volume; return Http::response(['id' => 'machine', 'state' => 'created']);
            }
            return Http::response(['name' => $w->app_name]);
        });
        $provider = app(FlyProvider::class);
        try { $provider->configure($w); $this->fail('expected the unknown outcome'); }
        catch (\RuntimeException $e) { $this->assertStringContainsString('outcome is unknown', $e->getMessage()); }
        $this->assertSame(['machine' => 'machine', 'volume' => 'new'], $provider->configure($w));
        $this->assertSame([1, ['old'], 'new'], [$copies, $deleted, $mounted]);
    }
    public function test_a_recorded_copy_never_adopts_a_disk_older_than_the_request(): void
    {
        $id = $this->imported(); $this->start($id); $w = app(Workspaces::class)->owned($this->user->id, $id); $deleted = 0;
        \Illuminate\Support\Facades\Cache::put('cloud-disk-move:'.$id, ['from' => 'a', 'to' => null, 'at' => now()->getTimestamp()], now()->addDay());
        Http::fake(function ($request) use ($w, &$deleted) {
            $url = $request->url();
            if (str_contains($url, '?org_slug=')) return Http::response(['apps' => [['name' => $w->app_name, 'network' => $w->app_name]]]);
            if (str_ends_with($url, '/volumes')) return Http::response([
                ['id' => 'a', 'name' => 'project', 'region' => 'lhr', 'state' => 'created', 'encrypted' => true, 'size_gb' => 20, 'created_at' => now()->subDays(2)->toIso8601String()],
                ['id' => 'b', 'name' => 'project', 'region' => 'lhr', 'state' => 'created', 'encrypted' => true, 'size_gb' => 20, 'created_at' => now()->subDay()->toIso8601String()]]);
            if ($request->method() === 'DELETE') $deleted++;
            return Http::response(['name' => $w->app_name]);
        });
        try { app(FlyProvider::class)->configure($w); $this->fail('expected a refusal'); }
        catch (\App\Services\CloudWorkspaces\ProviderReview $e) { $this->assertSame('Multiple project disks need reconciliation.', $e->getMessage()); }
        $this->assertSame(0, $deleted);
    }
    /** After retention (or Delete everything) removed the Fly app and its disks, the next start makes new ones. */
    public function test_a_start_after_the_app_and_disks_were_removed_makes_new_ones(): void
    {
        $id = $this->imported(); $this->start($id); $w = app(Workspaces::class)->owned($this->user->id, $id);
        $made = []; $volumes = []; $mounted = null;
        Http::fake(function ($request) use ($w, &$made, &$volumes, &$mounted) {
            $url = $request->url(); $method = $request->method(); $path = parse_url($url, PHP_URL_PATH);
            if (str_contains($url, '?org_slug=')) return Http::response(['apps' => in_array('app', $made, true) ? [['name' => $w->app_name, 'network' => $w->app_name]] : []]);
            if ($method === 'GET' && str_ends_with($path, '/apps/'.$w->app_name)) return in_array('app', $made, true) ? Http::response(['name' => $w->app_name]) : Http::response([], 404);
            if ($method === 'POST' && str_ends_with($path, '/apps')) { $made[] = 'app'; return Http::response(['name' => $w->app_name]); }
            if (str_ends_with($path, '/volumes') && $method === 'GET') return Http::response($volumes);
            if (str_ends_with($path, '/volumes') && $method === 'POST') {
                $made[] = 'volume'; $volumes[] = $v = ['id' => 'fresh', 'name' => 'project', 'region' => 'lhr', 'state' => 'created', 'encrypted' => true, 'size_gb' => 20];
                return Http::response($v);
            }
            if (str_ends_with($path, '/machines') && $method === 'GET') return Http::response([]);
            if (str_ends_with($path, '/machines') && $method === 'POST') { $made[] = 'machine'; $mounted = $request->data()['config']['mounts'][0]['volume']; return Http::response(['id' => 'machine', 'state' => 'created']); }
            return Http::response([], 404);
        });
        $this->assertSame(['machine' => 'machine', 'volume' => 'fresh'], app(FlyProvider::class)->configure($w));
        $this->assertSame([['app', 'volume', 'machine'], 'fresh'], [$made, $mounted]);
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
