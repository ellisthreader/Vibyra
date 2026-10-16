<?php
namespace Tests\Feature\CloudComputer;

use App\Services\CloudWorkspaces\{FlyProvider, Shutdown};
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Facades\{DB, Http};
use Symfony\Component\HttpKernel\Exception\HttpException;

class FlyStopProfileTest extends ComputeTestCase
{
    public function test_a_reviewed_image_never_overrides_the_accepted_resource_profile(): void
    {
        $this->postJson('/api/cloud-computer/wake', $this->accept($this->quote()))->assertStatus(202);
        DB::table('cloud_workspaces')->where('id', $this->cid)->update(['machine_id' => 'machine', 'ready_at' => now(), 'state' => 'ready']);
        $w = app(Shutdown::class)->request($this->user->id, $this->cid);
        $image = 'registry.test/runtime@sha256:'.str_repeat('a', 64);
        config(['cloud_workspaces.orderly_stop_images' => [$image]]);
        $machine = ['id' => 'machine', 'state' => 'started', 'image_ref' => ['digest' => 'sha256:'.str_repeat('a', 64)],
            'config' => ['image' => $image, 'guest' => ['cpu_kind' => 'performance', 'cpus' => 2, 'memory_mb' => 4096],
                'metadata' => ['vibyra_workspace' => $w->id, 'vibyra_operation' => $w->operation_id, 'vibyra_generation' => (string) $w->generation]]];
        foreach ([2, 4] as $cpus) {
            $machine['config']['guest']['cpus'] = $cpus;
            Http::swap(new Factory());
            Http::fake(fn ($r) => Http::response(str_ends_with($r->url(), '/stop') ? [] : $machine));
            if ($cpus === 2) {
                app(FlyProvider::class)->stop($w);
                Http::assertSent(fn ($r) => str_ends_with($r->url(), '/stop') && $r['timeout'] === '40s');
            } else {
                try { app(FlyProvider::class)->stop($w); $this->fail('Resource mismatch must be refused before stop.'); }
                catch (HttpException $e) { $this->assertSame(503, $e->getStatusCode()); $this->assertSame('Fly machine resources differ from the accepted profile.', $e->getMessage()); }
                Http::assertNotSent(fn ($r) => $r->method() === 'POST');
            }
        }
    }
}
