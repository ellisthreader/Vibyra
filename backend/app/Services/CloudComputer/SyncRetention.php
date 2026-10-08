<?php
namespace App\Services\CloudComputer;

use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Facades\{DB, Storage};

/** What cloud sync keeps: 3 newest blobs per chain plus anything not yet applied, quota, and the cleanups. */
class SyncRetention
{
    public const KEEP = 3;
    public const ACKED_HOURS = 24;
    public const ABANDONED_DOWN_DAYS = 30;

    public function disk(): Filesystem
    {
        return Storage::disk(config('cloud_workspaces.sync_disk'));
    }

    public function usedBytes(int $user): int
    {
        return (int) DB::table('cloud_sync_blobs')->where('user_id', $user)->sum('bytes');
    }

    public function limitBytes(): int
    {
        return (int) config('cloud_workspaces.sync_quota_bytes');
    }

    /** Files first, then rows: a failed delete leaves the row so the next prune retries. */
    public function deleteBlobs(iterable $blobs, bool $afterCommit = false): void
    {
        if ($afterCommit) {
            $pending = is_array($blobs) ? $blobs : iterator_to_array($blobs);
            DB::afterCommit(fn () => $this->deleteFiles($pending));
            return;
        }
        $this->deleteFiles($blobs);
    }

    private function deleteFiles(iterable $blobs): void
    {
        $ids = [];
        foreach ($blobs as $b) {
            try { $this->disk()->delete($b->path); } catch (\Throwable $e) { report($e); continue; }
            $ids[] = $b->id;
        }
        foreach (array_chunk($ids, 400) as $chunk) DB::table('cloud_sync_blobs')->whereIn('id', $chunk)->delete();
    }

    /** Keep the newest KEEP per (project, direction, kind, recipient) plus un-applied blobs; acked downloads go after a day. */
    public function prune(int $project, int $keep = self::KEEP): void
    {
        $blobs = DB::table('cloud_sync_blobs')->where('project_id', $project)->orderByDesc('seq')->orderByDesc('created_at')->get();
        $seen = []; $drop = [];
        foreach ($blobs as $b) {
            $settled = $b->applied_at || $b->failed_at;
            $stale = $settled && $b->direction === 'down' && now()->gte(\Illuminate\Support\Carbon::parse($b->applied_at ?? $b->failed_at)->addHours(self::ACKED_HOURS));
            $key = $b->direction.'|'.$b->kind.'|'.($b->recipient_mac_id ?? '-');
            $seen[$key] = ($seen[$key] ?? 0) + 1;
            if ($stale || ($settled && $seen[$key] > $keep)) $drop[] = $b;
        }
        $this->deleteBlobs($drop);
    }

    public function dropDownFor(int $user, array $macIds): void
    {
        $this->deleteBlobs(DB::table('cloud_sync_blobs')->where('user_id', $user)->where('direction', 'down')->whereIn('recipient_mac_id', $macIds)->get());
    }

    /** The cloud computer no longer has what it applied (new key or removed volume): nothing sealed for it is readable. */
    public function vmLostItsCopy(int $user, bool $afterCommit = false): void
    {
        $this->deleteBlobs(DB::table('cloud_sync_blobs')->where('user_id', $user)->where('direction', 'up')->get(), $afterCommit);
        app(SyncLogins::class)->vmLostItsCopy($user, $afterCommit);
        DB::table('cloud_sync_projects')->where('user_id', $user)->whereNull('removed_at')->update(['resync' => true, 'up_applied_seq' => 0, 'transcripts_applied_seq' => 0,
            'up_applied_head' => null, 'applied_at' => null, 'updated_at' => now()]);
        DB::table('cloud_sync_projects')->where('user_id', $user)->whereNull('removed_at')->where('up_seq', '>', 0)->whereIn('state', ['synced', 'diverged', 'error'])
            ->update(['state' => 'pending', 'reason' => null]);
    }

    /** Retention removed the stopped computer's volume (called after it commits). */
    public function volumeRemoved(int $user): void
    {
        DB::table('cloud_sync_vm_keys')->where('user_id', $user)->update(['public_key' => null, 'applying' => false, 'applying_at' => null, 'updated_at' => now()]);
        $this->vmLostItsCopy($user);
    }

    public function dropProject(int $project): void
    {
        $this->deleteBlobs(DB::table('cloud_sync_blobs')->where('project_id', $project)->get());
    }

    /** Account deletion: every file of this account, then its rows (the account may still fail to delete; its sync data is gone either way). */
    public function purgeUser(int $user): void
    {
        // Rows first: an upload that lands meanwhile then fails its own transaction and deletes its file (SyncBlobs/SyncLogins).
        foreach (['cloud_sync_blobs', 'cloud_sync_logins', 'cloud_sync_projects', 'cloud_sync_macs', 'cloud_sync_vm_keys'] as $table) DB::table($table)->where('user_id', $user)->delete();
        $this->disk()->deleteDirectory((string) $user);
        app(SyncUploadParts::class)->purgeUser($user);
    }

    /** Scheduled: acked downloads, abandoned downloads, finished removals. Returns how many blobs went. */
    public function sweep(): int
    {
        $before = DB::table('cloud_sync_blobs')->count();
        DB::table('cloud_sync_projects')->orderBy('id')->each(fn ($p) => $this->prune($p->id));
        $this->deleteBlobs(DB::table('cloud_sync_blobs')->where('direction', 'down')->whereNull('applied_at')->whereNull('failed_at')
            ->where('created_at', '<', now()->subDays(self::ABANDONED_DOWN_DAYS))->get());
        // A removal tombstone has done its job a day after the computer saw it, or when the volume would be gone anyway.
        DB::table('cloud_sync_projects')->whereNotNull('removed_at')->where(fn ($q) => $q->where('removed_seen_at', '<', now()->subDay())
            ->orWhere('removed_at', '<', now()->subDays(max(7, (int) config('cloud_workspaces.computer_stopped_days')))))->delete();
        return max(0, $before - DB::table('cloud_sync_blobs')->count()) + app(SyncLogins::class)->sweep();
    }
}
