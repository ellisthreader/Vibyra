<?php
namespace App\Services\CloudComputer;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/** Cloud sync projects: the account's name <-> projectKey grants and the state shown to the Mac. */
class SyncProjects
{
    public const KEY = '/^[a-f0-9]{32}$/';

    public static function validName(string $name): bool
    {
        return preg_match(Projects::NAME, $name) === 1 && !str_ends_with($name, '.lock');
    }

    public function find(int $user, string $name): ?object
    {
        return DB::table('cloud_sync_projects')->where('user_id', $user)->where('name', $name)->whereNull('removed_at')->first();
    }

    public function findOrFail(int $user, string $name): object
    {
        return $this->find($user, $name) ?? Computers::fail('unknown_project', 'This project is not synced.', 404);
    }

    /** Idempotent by projectKey. A name taken by another project gets "-<first 4 hex of projectKey>". */
    public function grant(int $user, string $key, string $name, ?string $skipped): object
    {
        return DB::transaction(function () use ($user, $key, $name, $skipped) {
            // The account row serialises concurrent grants (names are unique per account).
            DB::table('users')->where('id', $user)->lockForUpdate()->first();
            $row = DB::table('cloud_sync_projects')->where('user_id', $user)->where('project_key', $key)->first();
            // Nothing syncs until the person ticks it on the phone (AccessProjects; 409 project_not_allowed).
            app(AccessProjects::class)->admitGrant($user, $key, $row, $skipped !== null);
            $volumeGone = (bool) DB::table('cloud_workspaces')->where('user_id', $user)->where('kind', 'computer')->where('state', '!=', 'deleted')->whereNotNull('retention_deleted_at')->exists();
            if ($row) {
                $update = ['updated_at' => now()];
                if ($row->removed_at) $update += ['removed_at' => null, 'removed_seen_at' => null, 'resync' => true, 'up_applied_seq' => 0, 'transcripts_applied_seq' => 0, 'applied_at' => null, 'up_applied_head' => null];
                if ($skipped !== null && (int) $row->up_seq === 0) $update += ['state' => 'skipped', 'reason' => $skipped];
                elseif ($skipped === null && $row->state === 'skipped' && (int) $row->up_seq === 0) $update += ['state' => 'pending', 'reason' => null];
                DB::table('cloud_sync_projects')->where('id', $row->id)->update($update);
                return DB::table('cloud_sync_projects')->where('id', $row->id)->first();
            }
            $id = DB::table('cloud_sync_projects')->insertGetId(['user_id' => $user, 'project_key' => $key, 'name' => $this->free($user, $key, $name),
                'state' => $skipped !== null ? 'skipped' : 'pending', 'reason' => $skipped, 'resync' => $volumeGone, 'created_at' => now(), 'updated_at' => now()]);
            return DB::table('cloud_sync_projects')->where('id', $id)->first();
        });
    }

    private function free(int $user, string $key, string $name): string
    {
        $taken = fn (string $n) => DB::table('cloud_sync_projects')->where('user_id', $user)->where('name', $n)->exists()
            || DB::table('cloud_computer_projects')->join('cloud_workspaces', 'cloud_workspaces.id', '=', 'cloud_computer_projects.workspace_id')
                ->where('cloud_workspaces.user_id', $user)->where('cloud_computer_projects.name', $n)->exists();
        if (!$taken($name)) return $name;
        foreach ([4, 8, 16, 32] as $n) {
            $candidate = substr($name, 0, 63 - $n).'-'.substr($key, 0, $n);
            if (!$taken($candidate)) return $candidate;
        }
        Computers::fail('name_taken', 'That project name is already used on your cloud computer.', 409);
    }

    /** The Mac removed it from sync: drop the blobs, keep a tombstone so the cloud computer removes its folder. */
    public function remove(int $user, string $name): void
    {
        $p = $this->find($user, $name);
        if (!$p) return;
        app(SyncRetention::class)->dropProject($p->id);
        DB::table('cloud_sync_projects')->where('id', $p->id)->update(['removed_at' => now(), 'removed_seen_at' => null, 'up_applied_seq' => 0,
            'transcripts_applied_seq' => 0, 'applied_at' => null, 'up_applied_head' => null, 'resync' => true, 'updated_at' => now()]);
    }

    public function all(int $user): array
    {
        $bytes = DB::table('cloud_sync_blobs')->where('user_id', $user)->groupBy('project_id')->selectRaw('project_id, sum(bytes) as b')->pluck('b', 'project_id');
        return DB::table('cloud_sync_projects')->where('user_id', $user)->whereNull('removed_at')->orderBy('name')->get()
            ->map(fn ($p) => $this->payload($p, (int) ($bytes[$p->id] ?? 0)))->all();
    }

    public function payload(object $p, ?int $bytes = null): array
    {
        $bytes ??= (int) DB::table('cloud_sync_blobs')->where('project_id', $p->id)->sum('bytes');
        $iso = fn ($v) => $v ? Carbon::parse($v)->toIso8601String() : null;
        return ['name' => $p->name, 'projectKey' => $p->project_key, 'upSeq' => (int) $p->up_seq, 'upHead' => $p->up_head, 'upSyncedAt' => $iso($p->up_synced_at),
            'upAppliedSeq' => (int) $p->up_applied_seq, 'appliedAt' => $iso($p->applied_at), 'state' => $p->state, 'reason' => $p->reason, 'resync' => (bool) $p->resync,
            'cloudSeq' => (int) $p->down_seq, 'cloudHead' => $p->down_head, 'cloudAt' => $iso($p->down_at), 'transcriptsSeq' => (int) $p->transcripts_seq,
            'transcriptsAppliedSeq' => (int) $p->transcripts_applied_seq, 'bytes' => $bytes];
    }

    public function fresh(int $id): array
    {
        return $this->payload(DB::table('cloud_sync_projects')->where('id', $id)->first());
    }
}
