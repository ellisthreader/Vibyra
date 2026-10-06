<?php
namespace App\Services\CloudComputer;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/** The cloud-sync additions to the state object S (Computers::payload): computer.sync and the per-project source/syncedAt/syncState. */
class SyncState
{
    public function summary(int $user): array
    {
        return ['vmKeyReady' => app(SyncKeys::class)->vmKey($user) !== null, 'pending' => app(SyncQueue::class)->pendingCount($user),
            'applying' => app(SyncKeys::class)->applying($user), 'vm' => app(SyncKeys::class)->vmHealth($user), 'usedBytes' => app(SyncRetention::class)->usedBytes($user), 'limitBytes' => app(SyncRetention::class)->limitBytes()];
    }

    /** Host-reported / queued projects merged with synced ones by name. Existing fields stay as they were. */
    public function merge(int $user, array $projects): array
    {
        $synced = DB::table('cloud_sync_projects')->where('user_id', $user)->whereNull('removed_at')->orderBy('name')->get()->keyBy('name');
        $access = app(AccessProjects::class)->allowedMap($user);
        $out = [];
        foreach ($projects as $p) {
            $s = $synced[$p['name']] ?? null;
            $out[$p['name']] = $p + $this->fields($s, $access, $p['name']);
        }
        foreach ($synced as $name => $s) $out[$name] ??= ['name' => $name, 'repo' => null, 'branch' => null] + $this->fields($s, $access, $name);
        return array_values($out);
    }

    /** `allowed` (docs/cloud-access-contract.md): the decision for the sync row's key, else a decision with that name. */
    private function fields(?object $s, array $access, string $name): array
    {
        return ['source' => $s ? 'mac' : 'cloud', 'syncedAt' => $s?->applied_at ? Carbon::parse($s->applied_at)->toIso8601String() : null, 'syncState' => $s?->state,
            'allowed' => $s ? ($access['keys'][$s->project_key] ?? false) : ($access['names'][$name] ?? false)];
    }
}
