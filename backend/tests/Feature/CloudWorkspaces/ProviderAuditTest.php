<?php
namespace Tests\Feature\CloudWorkspaces;

use App\Services\CloudWorkspaces\{Eligibility, FlyProvider, ProviderAudit, Shutdown, Workspaces};
use Illuminate\Support\Facades\{DB, Http};

final class ProviderAuditTest extends CloudTestCase
{
    public function test_late_create_is_stopped_and_admission_waits_for_confirmed_audit(): void
    {
        $id = $this->imported(); $this->start($id);
        app(Shutdown::class)->request($this->user->id, $id, 'boot_timeout');
        app(Shutdown::class)->confirm(app(Workspaces::class)->owned($this->user->id, $id));
        $w = app(Workspaces::class)->owned($this->user->id, $id); $stopped = false;
        Http::fake(function ($r) use ($w, &$stopped) {
            if (str_contains($r->url(), '?org_slug=')) return Http::response(['apps' => [['name' => $w->app_name, 'network' => $w->app_name]]]);
            if (str_ends_with($r->url(), '/stop')) { $stopped = true; return Http::response([]); }
            return Http::response([['id' => 'late', 'state' => $stopped ? 'stopped' : 'started', 'config' => ['metadata' => [
                'vibyra_workspace' => $w->id, 'vibyra_operation' => $w->operation_id, 'vibyra_generation' => '1']]]]);
        });
        config(['cloud_workspaces.provider_audit_required' => true]);
        $this->assertFalse(app(ProviderAudit::class)->run()); $this->assertTrue($stopped);
        $this->assertTrue((bool) DB::table('cloud_workspace_control')->value('admission_blocked'));
        $this->assertTrue(app(ProviderAudit::class)->run()); app(Eligibility::class)->authorize($this->user->id, true);
        DB::table('cloud_workspaces')->where('id', $id)->update(['state' => 'deleted']);
        DB::table('cloud_quotes')->where('workspace_id', $id)->update(['payload' => '{}']);
        $stopped = false;
        $this->assertFalse(app(ProviderAudit::class)->run()); $this->assertTrue($stopped);
        $this->assertTrue(app(ProviderAudit::class)->run());
        $this->travel(121)->seconds();
        try { app(Eligibility::class)->authorize($this->user->id, true); $this->fail('An old audit cannot authorize provisioning'); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(503, $e->getStatusCode()); }
    }
    public function test_unknown_resources_block_starts_and_are_never_destroyed(): void
    {
        Http::fake(['*' => Http::response(['apps' => [['name' => 'vibyra-ws-unknown', 'network' => 'vibyra-ws-unknown']]])]);
        $this->assertFalse(app(ProviderAudit::class)->run());
        $this->assertSame('unknown_app_or_network', DB::table('cloud_workspace_control')->value('audit_reason'));
        Http::assertSentCount(1);
    }
    public function test_unencrypted_volume_is_refused_before_machine_creation(): void
    {
        $id = $this->imported(); $this->start($id); $w = app(Workspaces::class)->owned($this->user->id, $id);
        Http::fake(function ($r) use ($w) {
            if (str_contains($r->url(), '?org_slug=')) return Http::response(['apps' => [['name' => $w->app_name, 'network' => $w->app_name]]]);
            if (str_ends_with($r->url(), '/volumes')) return Http::response([['id' => 'vol', 'name' => 'project', 'region' => 'lhr', 'encrypted' => false, 'size_gb' => 20]]);
            return Http::response(['name' => $w->app_name]);
        });
        try { app(FlyProvider::class)->configure($w); $this->fail('Unencrypted disk must fail closed'); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(503, $e->getStatusCode()); }
        Http::assertNotSent(fn ($r) => $r->method() === 'POST');
    }
}
