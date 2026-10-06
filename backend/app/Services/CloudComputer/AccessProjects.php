<?php
namespace App\Services\CloudComputer;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Which Mac projects Vibyra Cloud may keep (docs/cloud-access-contract.md). Nothing syncs until the person ticks it:
 * a key with no `allowed` decision is refused at grant and upload. Unticking deletes the cloud copy (SyncProjects::remove).
 */
class AccessProjects
{
    public const MAX_ITEMS = 100;

    /** The sync engine's project key for a Mac project id. The phone sends the id; only the server hashes it. */
    public static function key(string $id): string
    {
        return substr(hash('sha256', 'vibyra-project:'.$id), 0, 32);
    }

    public function allowed(int $user, string $key): bool
    {
        return (bool) DB::table('cloud_project_access')->where('user_id', $user)->where('project_key', $key)->value('allowed');
    }

    /** @return list<string> */
    public function allowedKeys(int $user): array
    {
        return DB::table('cloud_project_access')->where('user_id', $user)->where('allowed', true)->orderBy('project_key')->pluck('project_key')->all();
    }

    /**
     * Records decisions. Each item: `{key, name|null, allowed}`. A name may be left out only for a key the account already
     * knows (a decision or a sync row). Denied keys lose their live cloud copy (blobs dropped, tombstone for the VM).
     * @param list<array{key:string,name:?string,allowed:bool}> $items
     */
    public function decide(int $user, array $items, string $source): void
    {
        $denied = DB::transaction(function () use ($user, $items, $source) {
            // Same lock as SyncProjects::grant: a grant either sees this decision or finished before it.
            DB::table('users')->where('id', $user)->lockForUpdate()->first();
            $denied = [];
            foreach ($items as $i) {
                $existing = DB::table('cloud_project_access')->where('user_id', $user)->where('project_key', $i['key'])->first();
                $name = $i['name'] ?? $existing?->name ?? DB::table('cloud_sync_projects')->where('user_id', $user)->where('project_key', $i['key'])->value('name');
                if ($name === null || $name === '') Computers::fail('invalid_request', 'Name the project to decide about it.', 422);
                $values = ['name' => mb_substr($name, 0, 120), 'allowed' => $i['allowed'], 'source' => $source, 'updated_at' => now()];
                if ($existing) DB::table('cloud_project_access')->where('id', $existing->id)->update($values);
                else DB::table('cloud_project_access')->insert($values + ['user_id' => $user, 'project_key' => $i['key'], 'created_at' => now()]);
                if (!$i['allowed']) $denied[] = $i['key'];
            }
            return $denied;
        });
        if (!$denied) return;
        $projects = app(SyncProjects::class);
        foreach (DB::table('cloud_sync_projects')->where('user_id', $user)->whereIn('project_key', $denied)->whereNull('removed_at')->pluck('name') as $name) {
            $projects->remove($user, $name);
        }
    }

    /**
     * SyncProjects::grant, inside its lock. A key that is not allowed is refused unless it is a `skipped` report (stores
     * nothing) for a project with no row or a live one; a skipped report never revives a removed project.
     */
    public function admitGrant(int $user, string $key, ?object $row, bool $skipped): void
    {
        if ($this->allowed($user, $key)) return;
        if ($skipped && (!$row || !$row->removed_at)) return;
        $this->refuse($key);
    }

    /** Every upload (`up`, `up-part`) for a project that is not allowed. */
    public function requireAllowed(object $project): void
    {
        if (!$this->allowed((int) $project->user_id, $project->project_key)) $this->refuse($project->project_key);
    }

    /** `projects` for GET /access: every decision plus every live sync row, by name. */
    public function rows(int $user): array
    {
        $decisions = DB::table('cloud_project_access')->where('user_id', $user)->get()->keyBy('project_key');
        $synced = DB::table('cloud_sync_projects')->where('user_id', $user)->whereNull('removed_at')->get()->keyBy('project_key');
        $bytes = DB::table('cloud_sync_blobs')->where('user_id', $user)->groupBy('project_id')->selectRaw('project_id, sum(bytes) as b')->pluck('b', 'project_id');
        $iso = fn ($v) => $v ? Carbon::parse($v)->toIso8601String() : null;
        $status = app(SyncStatus::class)->forUser($user);
        $out = [];
        foreach ($decisions->keys()->merge($synced->keys())->unique() as $key) {
            $d = $decisions[$key] ?? null; $s = $synced[$key] ?? null;
            $out[] = ['projectKey' => $key, 'name' => $d->name ?? $s->name, 'allowed' => (bool) ($d->allowed ?? false),
                'decidedAt' => $iso($d->updated_at ?? null), 'source' => $d->source ?? null,
                'cloud' => ['state' => $s->state ?? null, 'syncedAt' => $iso($s->applied_at ?? null), 'bytes' => $s ? (int) ($bytes[$s->id] ?? 0) : 0,
                    // The one status the phone shows (SyncStatus); null for a project that is not ticked.
                    'status' => ($d->allowed ?? false) ? ($status[$key] ?? null) : null]];
        }
        usort($out, fn ($a, $b) => [strtolower($a['name']), $a['projectKey']] <=> [strtolower($b['name']), $b['projectKey']]);
        return $out;
    }

    /** For the state object: `allowed` by sync key, and by decision name for projects with no sync row. */
    public function allowedMap(int $user): array
    {
        $rows = DB::table('cloud_project_access')->where('user_id', $user)->get(['project_key', 'name', 'allowed']);
        return ['keys' => $rows->mapWithKeys(fn ($r) => [$r->project_key => (bool) $r->allowed])->all(),
            'names' => $rows->mapWithKeys(fn ($r) => [$r->name => (bool) $r->allowed])->all()];
    }

    /** Disconnect: the decisions (project names) go with the rest of the account's cloud data. */
    public function purge(int $user): void
    {
        DB::table('cloud_project_access')->where('user_id', $user)->delete();
    }

    private function refuse(string $key): never
    {
        Computers::fail('project_not_allowed', 'This project is not chosen for Vibyra Cloud. Tick it on your iPhone first.', 409, ['projectKey' => $key]);
    }
}
