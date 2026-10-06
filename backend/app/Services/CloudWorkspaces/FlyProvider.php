<?php
namespace App\Services\CloudWorkspaces;

use Illuminate\Support\Facades\{Cache, Crypt, Http};

final class FlyProvider implements CloudWorkspaceProvider
{
    /** Cache key (per workspace) of a project disk being copied to a Fly server with room: `{from, to}` volume ids. */
    private const MOVE = 'cloud-disk-move:';

    public function preflight(): void
    {
        abort_unless(config('cloud_workspaces.fly_token') && config('cloud_workspaces.fly_org')
            && preg_match('/@sha256:[a-f0-9]{64}$/', (string) config('cloud_workspaces.image')),
            503, 'Fly credentials and a verified runtime image are needed.');
        abort_unless(str_starts_with((string) config('cloud_workspaces.api_origin'), 'https://') || app()->environment('testing', 'local'), 503, 'Cloud control must use HTTPS.');
        app(Leases::class)->privateKey();
        if (!app()->environment('testing', 'local')) {
            abort_unless(config('filesystems.disks.'.config('cloud_workspaces.disk').'.driver') === 's3', 503, 'Independent private backup storage is required.');
            abort_unless(in_array(config('cache.default'), ['database', 'redis'], true), 503, 'Cloud provisioning requires shared resource locks.');
        }
    }
    private function send(string $method, string $path, ?array $body = null): \Illuminate\Http\Client\Response
    {
        try {
            return Http::withToken(config('cloud_workspaces.fly_token'))->acceptJson()->connectTimeout(5)->timeout(12)
                ->send($method, config('cloud_workspaces.fly_url').$path, $body === null ? [] : ['json' => $body]);
        } catch (\Throwable) { throw new \RuntimeException('Fly operation outcome is unknown; reconcile before retrying.'); }
    }
    private function call(string $method, string $path, ?array $body = null, bool $missing = false): mixed
    {
        $r = $this->send($method, $path, $body);
        if ($missing && $r->status() === 404) return null;
        if (!$r->successful()) throw new \RuntimeException('Fly request was not confirmed (status '.$r->status().').');
        return $r->json() ?? [];
    }
    public function configure(object $w): array
    {
        $this->preflight(); $path = '/apps/'.$w->app_name;
        if ($this->call('GET', $path, missing: true) === null) {
            $this->call('POST', '/apps', ['app_name' => $w->app_name, 'org_slug' => config('cloud_workspaces.fly_org'), 'network' => $w->app_name]);
        }
        // Read organization metadata rather than assuming a name collision is ours.
        $this->verifyApp($w);
        $volumes = $this->call('GET', $path.'/volumes');
        // A destroyed disk stays listed (pending_destroy) for a while; it is not a second project disk.
        $matching = array_values(array_filter($volumes, fn ($v) => ($v['name'] ?? null) === 'project' && ($v['region'] ?? null) === $w->region
            && !in_array($v['state'] ?? '', ['pending_destroy', 'destroying', 'destroyed'], true)));
        $volume = $this->projectVolume($w, $path, $matching) ?? $this->call('POST', $path.'/volumes', ['name' => 'project', 'region' => $w->region,
            'size_gb' => config('cloud_workspaces.volume_gib'), 'encrypted' => true, 'snapshot_retention' => 5,
            'compute' => ['cpu_kind' => 'performance', 'cpus' => 2, 'memory_mb' => 4096]]);
        abort_unless(is_string($volume['id'] ?? null) && ($volume['encrypted'] ?? false) === true
            && ($volume['size_gb'] ?? 0) === config('cloud_workspaces.volume_gib'), 503, 'Fly project disk could not be verified.');
        $machines = $this->call('GET', $path.'/machines');
        // All predecessors must be stopped before the replacement generation can exist.
        foreach ($machines as $machine) {
            $metadata = $machine['config']['metadata'] ?? [];
            abort_unless(($metadata['vibyra_workspace'] ?? null) === $w->id, 503, 'Unexpected Fly resource needs operator review.');
            if (($metadata['vibyra_operation'] ?? null) === $w->operation_id) {
                $this->verifyMachine($w, $machine); return ['machine' => $machine['id'], 'volume' => $volume['id']];
            }
            abort_unless(in_array($machine['state'] ?? '', ['stopped', 'destroyed'], true), 503, 'The previous cloud computer has not stopped.');
            if ($machine['state'] !== 'destroyed') $this->call('DELETE', $path.'/machines/'.$machine['id']);
        }
        $r = $this->send('POST', $path.'/machines', ['name' => 'workspace-'.$w->generation, 'region' => $w->region,
            'config' => ['image' => config('cloud_workspaces.image'), 'guest' => ['cpu_kind' => 'performance', 'cpus' => 2, 'memory_mb' => 4096],
                'restart' => ['policy' => 'no'], 'auto_destroy' => false, 'services' => [],
                'mounts' => [['volume' => $volume['id'], 'path' => '/data']],
                'metadata' => ['vibyra_workspace' => $w->id, 'vibyra_operation' => $w->operation_id, 'vibyra_generation' => (string) $w->generation],
                'env' => ['VIBYRA_API_ORIGIN' => config('cloud_workspaces.api_origin'), 'VIBYRA_WORKSPACE_ID' => $w->id,
                    'VIBYRA_GENERATION' => (string) $w->generation, 'VIBYRA_BOOTSTRAP' => Crypt::decryptString($w->bootstrap_secret),
                    'VIBYRA_LEASE_PUBLIC_KEY' => app(Leases::class)->publicKey()]]]);
        // The Fly server holding the disk has no room for the machine: move the disk, and a later reconcile starts it there.
        if ($r->status() === 412 && $r->json('status') === 'volume_placement_capacity') {
            $this->moveDisk($w, $path, $volume);
            throw new \RuntimeException('No room next to the project disk; it is moving to a Fly server with room.');
        }
        if (!$r->successful()) throw new \RuntimeException('Fly request was not confirmed (status '.$r->status().').');
        $machine = $r->json() ?? [];
        abort_unless(is_string($machine['id'] ?? null), 503, 'Fly machine creation was not confirmed.');
        return ['machine' => $machine['id'], 'volume' => $volume['id']];
    }
    /**
     * The project disk to mount (null: none yet). Two live ones are only expected while moveDisk copies the disk to a
     * server with room: the copy is used once Fly has filled it, and the original is removed once no machine holds it.
     * Any other pair waits for an operator; a disk is never removed on a guess.
     */
    private function projectVolume(object $w, string $path, array $live): ?array
    {
        if (count($live) <= 1) {
            if (($live[0]['state'] ?? '') === 'hydrating') throw new \RuntimeException('The project disk is still being copied; retry shortly.');
            return $live[0] ?? null;
        }
        $move = Cache::get(self::MOVE.$w->id); $by = array_column($live, null, 'id');
        abort_unless(count($live) === 2 && is_array($move) && isset($by[$move['from'] ?? ''], $by[$move['to'] ?? '']), 503, 'Multiple project disks need reconciliation.');
        $copy = $by[$move['to']]; $original = $by[$move['from']];
        if (($copy['state'] ?? '') !== 'created') throw new \RuntimeException('The project disk is still moving to a Fly server with room; retry shortly.');
        // A stopped predecessor may still hold the original: it is removed below, and the original on the next start.
        if (empty($original['attached_machine_id'])) { $this->call('DELETE', $path.'/volumes/'.$original['id']); Cache::forget(self::MOVE.$w->id); }
        return $copy;
    }
    /** Copies the project disk to a Fly server with room for the machine (Fly fills the copy in the background). */
    private function moveDisk(object $w, string $path, array $volume): void
    {
        if ((Cache::get(self::MOVE.$w->id)['from'] ?? null) === $volume['id']) return; // already moving
        $copy = $this->call('POST', $path.'/volumes', ['name' => 'project', 'region' => $w->region, 'source_volume_id' => $volume['id'],
            'require_unique_zone' => true, 'compute' => ['cpu_kind' => 'performance', 'cpus' => 2, 'memory_mb' => 4096]]);
        abort_unless(is_string($copy['id'] ?? null) && ($copy['encrypted'] ?? false) === true
            && ($copy['size_gb'] ?? 0) === config('cloud_workspaces.volume_gib'), 503, 'The moved project disk could not be verified.');
        Cache::put(self::MOVE.$w->id, ['from' => $volume['id'], 'to' => $copy['id']], now()->addDays(7));
    }
    public function inspect(object $w): string
    {
        if (!$w->machine_id) return 'absent';
        $m = $this->call('GET', '/apps/'.$w->app_name.'/machines/'.$w->machine_id, missing: true);
        // A failed create leaves machine_id on the predecessor it already destroyed; a destroyed machine runs nothing.
        if ($m && ($m['state'] ?? '') !== 'destroyed') $this->verifyMachine($w, $m);
        return $m['state'] ?? 'absent';
    }
    public function recover(object $w): ?array
    {
        $path = '/apps/'.$w->app_name;
        if ($this->call('GET', $path, missing: true) === null) return null;
        $this->verifyApp($w);
        foreach ($this->call('GET', $path.'/machines') as $m) {
            $this->verifyMachine($w, $m, false);
            if (($m['config']['metadata']['vibyra_operation'] ?? null) === $w->operation_id) {
                $this->verifyMachine($w, $m);
                return ['machine' => $m['id'], 'volume' => $m['config']['mounts'][0]['volume'] ?? $w->volume_id];
            }
        }
        return null;
    }
    public function stop(object $w): void
    {
        if ($w->machine_id && !in_array($this->inspect($w), ['stopped', 'destroyed', 'absent'], true)) {
            $this->call('POST', '/apps/'.$w->app_name.'/machines/'.$w->machine_id.'/stop', ['signal' => 'SIGTERM', 'timeout' => '10s']);
        }
    }
    public function destroy(object $w): void
    {
        $path = '/apps/'.$w->app_name;
        if ($this->call('GET', $path, missing: true) === null) return;
        $this->verifyApp($w);
        foreach ($this->call('GET', $path.'/machines') as $m) {
            $this->verifyMachine($w, $m, false);
            abort_unless(in_array($m['state'], ['stopped', 'destroyed'], true), 409, 'Stop the cloud computer before deleting it.');
            if ($m['state'] !== 'destroyed') $this->call('DELETE', $path.'/machines/'.$m['id']);
        }
        foreach ($this->call('GET', $path.'/volumes') as $v) $this->call('DELETE', $path.'/volumes/'.$v['id']);
        $this->call('DELETE', $path);
    }
    public function apps(): array
    {
        return $this->call('GET', '/apps?org_slug='.rawurlencode(config('cloud_workspaces.fly_org')))['apps'] ?? [];
    }
    public function machines(object $w): array { return $this->call('GET', '/apps/'.$w->app_name.'/machines'); }
    public function stopResource(object $w, array $m): void
    {
        $this->verifyMachine($w, $m, false);
        if (!in_array($m['state'] ?? '', ['stopped', 'destroyed'], true))
            $this->call('POST', '/apps/'.$w->app_name.'/machines/'.$m['id'].'/stop', ['signal' => 'SIGTERM', 'timeout' => '10s']);
    }
    private function verifyApp(object $w): void
    {
        abort_unless(collect($this->apps())->contains(fn ($a) => ($a['name'] ?? null) === $w->app_name
            && ($a['network'] ?? null) === $w->app_name), 503, 'Fly workspace network ownership could not be verified.');
    }
    private function verifyMachine(object $w, array $m, bool $current = true): void
    {
        $meta = $m['config']['metadata'] ?? [];
        abort_unless(($meta['vibyra_workspace'] ?? null) === $w->id && (!$current
            || (($meta['vibyra_operation'] ?? null) === $w->operation_id && (string) ($meta['vibyra_generation'] ?? '') === (string) $w->generation)),
            503, 'Fly machine ownership could not be verified.');
    }
}
