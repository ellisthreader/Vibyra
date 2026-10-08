<?php
namespace App\Services\CloudComputer;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Accepts sealed bundles (Mac -> cloud "up", cloud -> Mac "down"): seq rules, streaming, quota, bookkeeping. */
class SyncBlobs
{
    /**
     * @param array{kind:string,seq:int,baseSeq:int,head:?string,sha256:string} $q
     * @param resource $stream  the raw request body
     */
    public function receive(object $project, string $direction, array $q, $stream, ?object $mac, ?int $declared, ?object $runtime = null): object
    {
        $cap = (int) config('cloud_workspaces.sync_max_blob_bytes');
        if ($declared !== null && $declared > $cap) Computers::fail('too_large', 'This project is too large to sync.', 413);
        $this->checkSeq($project, $direction, $q);
        $retention = app(SyncRetention::class);
        $spooled = app(SyncUpload::class)->spool($stream, $cap);
        $tmp = $spooled['path'];
        try {
            if ($spooled['bytes'] === 0) Computers::fail('empty_body', 'The upload was empty.', 422);
            if (!hash_equals($q['sha256'], $spooled['sha256'])) Computers::fail('sha_mismatch', 'The upload did not match its checksum. Try again.', 422);
            $this->checkQuota($project, $spooled['bytes']);
            $id = (string) Str::uuid(); $path = $project->user_id.'/'.$project->id.'/'.$id;
            app(SyncUpload::class)->store($tmp, $path);
        } catch (\Throwable $e) { @unlink($tmp); throw $e; }
        try {
            $replaced = DB::transaction(function () use ($project, $direction, $q, $mac, $id, $path, $spooled, $runtime) {
                // Quota spans every project. Serialize the final admission,
                // then check the project after taking the account lock.
                app(\App\Services\Vibes\Wallet::class)->lock((int) $project->user_id);
                if ($runtime) app(\App\Services\CloudWorkspaces\Runtime::class)->current($runtime);
                $this->checkQuota($project, $spooled['bytes'], false);
                $p = DB::table('cloud_sync_projects')->where('id', $project->id)->lockForUpdate()->first();
                if (!$p || $p->removed_at) Computers::fail('unknown_project', 'This project is not synced.', 404);
                $this->checkSeq($p, $direction, $q);
                $old = $direction === 'down' ? DB::table('cloud_sync_blobs')->where('project_id', $p->id)->where('direction', 'down')->where('kind', $q['kind'])
                    ->where('seq', $q['seq'])->where('recipient_mac_id', $mac->id)->get() : collect();
                DB::table('cloud_sync_blobs')->insert(['id' => $id, 'user_id' => $p->user_id, 'project_id' => $p->id, 'path' => $path, 'direction' => $direction,
                    'kind' => $q['kind'], 'seq' => $q['seq'], 'base_seq' => $q['baseSeq'], 'head' => $q['head'], 'sha256' => $spooled['sha256'],
                    'bytes' => $spooled['bytes'], 'recipient_mac_id' => $mac?->id, 'created_at' => now(), 'updated_at' => now()]);
                // A full bundle replaces everything before it: the cloud computer never needs the older ones.
                if ($direction === 'up' && $q['baseSeq'] === 0) DB::table('cloud_sync_blobs')->where('project_id', $p->id)->where('direction', 'up')->where('kind', $q['kind'])
                    ->where('seq', '<', $q['seq'])->whereNull('applied_at')->whereNull('failed_at')->update(['applied_at' => now()]);
                DB::table('cloud_sync_projects')->where('id', $p->id)->update($this->advance($p, $direction, $q) + ['updated_at' => now()]);
                return $old;
            });
        } catch (\Throwable $e) { $retention->deleteBlobs([(object) ['id' => $id, 'path' => $path]]); throw $e; }
        $retention->deleteBlobs($replaced);
        $retention->prune($project->id);
        return DB::table('cloud_sync_blobs')->where('id', $id)->first();
    }

    /** The seq rules alone, before any bytes arrive (a resumable upload checks them on its first piece). */
    public function precheck(object $project, string $direction, array $q): void
    {
        $this->checkSeq($project, $direction, $q);
    }

    private function checkSeq(object $p, string $direction, array $q): void
    {
        $code = $q['kind'] === 'code';
        if ($direction === 'up') {
            $last = (int) ($code ? $p->up_seq : $p->transcripts_seq);
            if ($q['seq'] !== $last + 1) Computers::fail('seq_conflict', 'Out of sync: the next upload is number '.($last + 1).'.', 409, ['expected' => $last + 1]);
            if ($p->resync && $q['baseSeq'] !== 0) Computers::fail('resync_required', 'Your cloud computer needs a full upload of this project.', 409);
        } else {
            // The cloud computer keeps its own down seq and uploads once per Mac, so the current number may repeat.
            $last = (int) ($code ? $p->down_seq : $p->transcripts_down_seq);
            if ($q['seq'] < max(1, $last) || $q['seq'] > $last + 1) Computers::fail('seq_conflict', 'Out of sync: the next upload is number '.($last + 1).'.', 409, ['expected' => $last + 1]);
        }
    }

    private function checkQuota(object $p, int $bytes, bool $prune = true): void
    {
        $retention = app(SyncRetention::class); $limit = $retention->limitBytes();
        if ($retention->usedBytes($p->user_id) + $bytes <= $limit) return;
        // Pruning deletes physical files. It must happen before, never inside,
        // a transaction that can roll back and resurrect their database rows.
        if ($prune) $retention->prune($p->id, SyncRetention::KEEP - 1); // what the new blob would push out anyway
        if ($retention->usedBytes($p->user_id) + $bytes > $limit) Computers::fail('quota_exceeded', 'Your cloud storage for synced projects is full.', 413);
    }

    private function advance(object $p, string $direction, array $q): array
    {
        $code = $q['kind'] === 'code';
        if ($direction === 'down') {
            return $code ? ['down_seq' => max((int) $p->down_seq, $q['seq']), 'down_head' => $q['head'], 'down_at' => now()]
                : ['transcripts_down_seq' => max((int) $p->transcripts_down_seq, $q['seq'])];
        }
        if (!$code) return ['transcripts_seq' => $q['seq']];
        return ['up_seq' => $q['seq'], 'up_head' => $q['head'], 'up_synced_at' => now(), 'state' => 'pending', 'reason' => null,
            'resync' => $q['baseSeq'] === 0 ? false : (bool) $p->resync];
    }
}
