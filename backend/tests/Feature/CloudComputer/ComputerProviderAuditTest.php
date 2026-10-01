<?php
namespace Tests\Feature\CloudComputer;

use App\Services\CloudWorkspaces\{Eligibility, ProviderAudit};
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Facades\{DB, Http};

/** The cloud computer wakes without a quote; the provider audit must still recognise its machine (and only its machine). */
class ComputerProviderAuditTest extends ComputerTestCase
{
    private function fly(object $w, array $meta, string $state = 'started'): void
    {
        Http::swap(new Factory());
        Http::fake(function ($r) use ($w, $meta, $state) {
            if (str_contains($r->url(), '?org_slug=')) return Http::response(['apps' => [['name' => $w->app_name, 'network' => $w->app_name]]]);
            if (str_ends_with($r->url(), '/stop')) return Http::response([]);
            return Http::response([['id' => 'machine', 'state' => $state, 'config' => ['metadata' => $meta]]]);
        });
        config(['cloud_workspaces.provider_audit_required' => true]);
    }

    private function meta(object $w, ?string $generation = null): array
    {
        return ['vibyra_workspace' => $w->id, 'vibyra_operation' => $w->operation_id, 'vibyra_generation' => $generation ?? (string) $w->generation];
    }

    public function test_the_computers_own_machine_passes_the_audit_and_admits_the_next_wake(): void
    {
        $this->computerReady(); $w = $this->row();
        $this->assertNotEmpty($w->app_name);
        $this->fly($w, $this->meta($w));
        $this->assertTrue(app(ProviderAudit::class)->run());
        $this->assertFalse((bool) DB::table('cloud_workspace_control')->value('admission_blocked'));
        // Asleep: the stopped machine of the last generation stays known, so a new wake is admitted.
        $this->sleepNow(); $w = $this->row();
        $this->fly($w, $this->meta($w), 'stopped');
        $this->assertTrue(app(ProviderAudit::class)->run());
        app(Eligibility::class)->authorize($this->user->id, true);
    }

    public function test_a_machine_from_an_unreached_generation_or_another_workspace_still_blocks(): void
    {
        $this->computerReady(); $w = $this->row();
        $this->fly($w, $this->meta($w, (string) ($w->generation + 1)));
        $this->assertFalse(app(ProviderAudit::class)->run());
        $this->assertSame('unknown_machine', DB::table('cloud_workspace_control')->value('audit_reason'));
        $this->fly($w, ['vibyra_workspace' => (string) \Illuminate\Support\Str::uuid()] + $this->meta($w));
        $this->assertFalse(app(ProviderAudit::class)->run());
        $this->fly($w, $this->meta($w, 'x'));
        $this->assertFalse(app(ProviderAudit::class)->run());
    }

    public function test_an_older_generation_machine_is_stopped_not_trusted_as_current(): void
    {
        $this->computerReady(); $w = $this->row();
        DB::table('cloud_workspaces')->where('id', $w->id)->update(['generation' => $w->generation + 1]); $w = $this->row();
        $stops = 0;
        Http::swap(new Factory());
        Http::fake(function ($r) use ($w, &$stops) {
            if (str_contains($r->url(), '?org_slug=')) return Http::response(['apps' => [['name' => $w->app_name, 'network' => $w->app_name]]]);
            if (str_ends_with($r->url(), '/stop')) { $stops++; return Http::response([]); }
            return Http::response([['id' => 'old', 'state' => 'started', 'config' => ['metadata' => [
                'vibyra_workspace' => $w->id, 'vibyra_operation' => 'old-op', 'vibyra_generation' => (string) ($w->generation - 1)]]]]);
        });
        config(['cloud_workspaces.provider_audit_required' => true]);
        $this->assertFalse(app(ProviderAudit::class)->run());
        $this->assertSame(1, $stops);
        $this->assertSame('stale_machine_stopping', DB::table('cloud_workspace_control')->value('audit_reason'));
    }
}
