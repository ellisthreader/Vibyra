<?php
namespace Tests\Feature\CloudWorkspaces;

use App\Services\CloudWorkspaces\{FlyProvider, Workspaces};
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/** Image rollout must keep the data volume and never replace an active predecessor. */
class CloudImageRolloutTest extends CloudTestCase
{
    private function fixture(): array
    {
        config(['app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        $id = $this->imported(); $this->start($id);
        $workspace = app(Workspaces::class)->owned($this->user->id, $id);
        $calls = (object) ['machine' => null, 'created' => [], 'deleted' => [], 'volumeWrites' => 0];
        Http::fake(function ($request) use ($workspace, $calls) {
            $url = $request->url(); $method = $request->method();
            if (str_contains($url, '?org_slug=')) return Http::response(['apps' => [['name' => $workspace->app_name, 'network' => $workspace->app_name]]]);
            if (str_contains($url, '/volumes') && $method !== 'GET') $calls->volumeWrites++;
            if (str_ends_with($url, '/volumes') && $method === 'GET') return Http::response([
                ['id' => 'retained-data', 'name' => 'project', 'region' => 'lhr', 'state' => 'created', 'encrypted' => true, 'size_gb' => 20],
            ]);
            if (str_ends_with($url, '/machines') && $method === 'GET') return Http::response($calls->machine ? [$calls->machine] : []);
            if (str_ends_with($url, '/machines') && $method === 'POST') {
                $calls->created[] = $request->data();
                $calls->machine = ['id' => 'generation-'.count($calls->created), 'state' => 'started', 'config' => $request->data()['config']];
                return Http::response($calls->machine);
            }
            if (str_contains($url, '/machines/') && $method === 'DELETE') {
                $calls->deleted[] = basename(parse_url($url, PHP_URL_PATH)); $calls->machine = null;
                return Http::response([]);
            }
            if ($method === 'GET' && str_ends_with($url, '/apps/'.$workspace->app_name)) return Http::response(['name' => $workspace->app_name]);
            throw new \RuntimeException('Unexpected provider request '.$method.' '.parse_url($url, PHP_URL_PATH));
        });
        config(['cloud_workspaces.image' => 'registry.example/runtime@sha256:'.str_repeat('a', 64)]);
        $provider = app(FlyProvider::class); $provider->configure($workspace);
        return [$provider, $workspace, $calls];
    }

    public function test_new_stopped_generation_uses_new_image_and_same_data_volume(): void
    {
        [$provider, $workspace, $calls] = $this->fixture();
        $calls->machine['state'] = 'stopped';
        $workspace->operation_id = (string) Str::uuid(); $workspace->generation++;
        $image = 'registry.example/runtime@sha256:'.str_repeat('b', 64);
        config(['cloud_workspaces.image' => $image]);
        $result = $provider->configure($workspace);
        $this->assertSame(['machine' => 'generation-2', 'volume' => 'retained-data'], $result);
        $this->assertSame(['generation-1'], $calls->deleted);
        $this->assertCount(2, $calls->created);
        $this->assertSame($image, $calls->created[1]['config']['image']);
        $this->assertSame($calls->created[0]['config']['mounts'], $calls->created[1]['config']['mounts']);
        $this->assertSame([['volume' => 'retained-data', 'path' => '/data']], $calls->created[1]['config']['mounts']);
        $this->assertSame((string) $workspace->generation, $calls->created[1]['config']['metadata']['vibyra_generation']);
        $this->assertSame(0, $calls->volumeWrites);
    }

    public function test_same_operation_retry_preserves_existing_machine_even_after_default_changes(): void
    {
        [$provider, $workspace, $calls] = $this->fixture();
        $original = $calls->machine;
        config(['cloud_workspaces.image' => 'registry.example/runtime@sha256:'.str_repeat('b', 64)]);
        $this->assertSame(['machine' => 'generation-1', 'volume' => 'retained-data'], $provider->configure($workspace));
        $this->assertSame($original, $calls->machine);
        $this->assertCount(1, $calls->created); $this->assertSame([], $calls->deleted);
        $this->assertSame(0, $calls->volumeWrites);
    }

    public function test_new_image_cannot_replace_a_running_previous_generation(): void
    {
        [$provider, $workspace, $calls] = $this->fixture();
        $workspace->operation_id = (string) Str::uuid(); $workspace->generation++;
        config(['cloud_workspaces.image' => 'registry.example/runtime@sha256:'.str_repeat('b', 64)]);
        try { $provider->configure($workspace); $this->fail('Running predecessor must block replacement.'); }
        catch (\Throwable $error) { $this->assertStringContainsString('previous cloud computer has not stopped', $error->getMessage()); }
        $this->assertCount(1, $calls->created); $this->assertSame([], $calls->deleted);
        $this->assertSame(0, $calls->volumeWrites);
    }
}
