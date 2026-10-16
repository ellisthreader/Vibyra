<?php
namespace App\Services\CloudComputer;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/** What is waiting for whom: the cloud computer's inbox (up blobs) and each Mac's inbox (down blobs), and their acknowledgements. */
class SyncQueue
{
    /** How long after the computer first sees a removal it is still offered (docs/cloud-sync-contract.md). */
    public const REMOVAL_RETRY_SECONDS = 300;

    public function pending(int $user): array
    {
        $names = DB::table('cloud_sync_projects')->where('user_id', $user)->get()->keyBy('id');
        $items = [];
        $rows = DB::table('cloud_sync_blobs')->where('user_id', $user)->where('direction', 'up')->whereNull('applied_at')->whereNull('failed_at')->orderBy('project_id')->orderBy('kind')->orderBy('seq')->get();
        $lostBase = [];
        foreach ($rows as $b) {
            $p = $names[$b->project_id] ?? null;
            // A project that must start over only takes a full bundle: an incremental one has lost its base.
            if ($p && !$p->removed_at && $p->resync && $b->kind === 'code' && (int) $b->base_seq !== 0) $lostBase[] = $p->id;
            if (!$p || $p->removed_at || ($p->resync && $b->kind === 'code' && (int) $b->base_seq !== 0)) continue;
            $items[] = ['id' => $b->id, 'project' => $p->name, 'kind' => $b->kind, 'seq' => (int) $b->seq, 'baseSeq' => (int) $b->base_seq, 'head' => $b->head,
                'bytes' => (int) $b->bytes, 'sha256' => $b->sha256];
        }
        usort($items, fn ($a, $b) => [$a['project'], $a['kind'] === 'code' ? 0 : 1, $a['seq']] <=> [$b['project'], $b['kind'] === 'code' ? 0 : 1, $b['seq']]);
        // Say why it waits: the Mac has to send the whole project (SyncStatus shows it as waiting for the Mac, not as applying).
        if ($lostBase) DB::table('cloud_sync_projects')->whereIn('id', array_unique($lostBase))->where('state', 'pending')->whereNull('reason')->update(['reason' => 'needs_full']);
        // A removal is offered until a few minutes after the computer first saw it (a retry if its delete failed), not for a day:
        // a stale tombstone made every pass look like work.
        $removed = DB::table('cloud_sync_projects')->where('user_id', $user)->whereNotNull('removed_at')
            ->where(fn ($q) => $q->whereNull('removed_seen_at')->orWhere('removed_seen_at', '>', now()->subSeconds(self::REMOVAL_RETRY_SECONDS)))->pluck('name')->all();
        DB::table('cloud_sync_projects')->where('user_id', $user)->whereNotNull('removed_at')->whereNull('removed_seen_at')->update(['removed_seen_at' => now()]);
        $resync = DB::table('cloud_sync_projects')->where('user_id', $user)->whereNull('removed_at')->where('resync', true)->orderBy('name')->pluck('name')->all();
        return ['items' => [...app(SyncLogins::class)->pending($user), ...$items], 'removed' => $removed, 'resync' => $resync];
    }

    public function pendingCount(int $user): int
    {
        return DB::table('cloud_sync_blobs')->where('user_id', $user)->where('direction', 'up')->whereNull('applied_at')->whereNull('failed_at')->count() + app(SyncLogins::class)->pendingCount($user);
    }

    public function upBlob(int $user, string $id): object
    {
        return DB::table('cloud_sync_blobs')->where('id', $id)->where('user_id', $user)->where('direction', 'up')->first() ?? Computers::fail('unknown_blob', 'Unknown upload.', 404);
    }

    /** The cloud computer's result for one up blob. */
    public function applied(int $user, string $id, array $d, ?object $runtime = null): void
    {
        DB::transaction(function () use ($user, $id, $d, $runtime) {
            app(\App\Services\Vibes\Wallet::class)->lock($user);
            if ($runtime) app(\App\Services\CloudWorkspaces\Runtime::class)->current($runtime);
            $b = $this->upBlob($user, $id);
            $p = DB::table('cloud_sync_projects')->where('id', $b->project_id)->lockForUpdate()->first();
            if ($b->applied_at || $b->failed_at || !$p) return;
            // The computer's fixed code (docs/cloud-sync-contract.md) when it sends one; older images send only free-text error.
            $error = isset($d['code']) ? (string) $d['code'] : (isset($d['error']) ? mb_substr((string) $d['error'], 0, 200) : null);
            // key_mismatch / needs_full and every needFull: not an error to the person, the Mac just sends the whole project again.
            $needFull = !empty($d['needFull']) || in_array($error, ['key_mismatch', 'needs_full'], true);
            if (!($d['ok'] ?? true) || $needFull) {
                DB::table('cloud_sync_blobs')->where('id', $b->id)->update(['failed_at' => now(), 'error' => $error, 'updated_at' => now()]);
                $failed = $needFull ? ['state' => 'pending', 'reason' => 'needs_full'] : ['state' => 'error', 'reason' => $error ?? 'apply_failed'];
                DB::table('cloud_sync_projects')->where('id', $p->id)->update(['resync' => true, 'updated_at' => now()] + ($b->kind === 'code' ? $failed : []));
                return;
            }
            DB::table('cloud_sync_blobs')->where('id', $b->id)->update(['applied_at' => now(), 'updated_at' => now()]);
            // A full bundle replaces everything before it.
            if ((int) $b->base_seq === 0) DB::table('cloud_sync_blobs')->where('project_id', $b->project_id)->where('direction', 'up')->where('kind', $b->kind)
                ->where('seq', '<', $b->seq)->whereNull('applied_at')->whereNull('failed_at')->update(['applied_at' => now()]);
            $update = ['updated_at' => now()];
            if ($b->kind === 'transcripts') $update['transcripts_applied_seq'] = max((int) $p->transcripts_applied_seq, (int) $b->seq);
            elseif ($b->seq > $p->up_applied_seq) {
                $caught = $b->seq >= $p->up_seq;
                $update += ['up_applied_seq' => $b->seq, 'up_applied_head' => $b->head ?? ($d['head'] ?? null), 'applied_at' => now(),
                    'state' => $caught ? (($d['state'] ?? 'synced') === 'diverged' ? 'diverged' : 'synced') : 'pending', 'reason' => null];
            }
            DB::table('cloud_sync_projects')->where('id', $p->id)->update($update);
        });
        app(SyncRetention::class)->prune(DB::table('cloud_sync_blobs')->where('id', $id)->value('project_id') ?? 0);
        app(SyncKeys::class)->touchComputer($user);
    }

    /** How long a refused blob keeps the sender in "start over" mode (a Mac that never comes back must not hold it for ever). */
    public const NEED_FULL_DAYS = 7;

    /**
     * What the cloud computer must know before choosing what to send: its own down seqs and, per kind, whether some Mac's newest
     * blob was refused as unusable without what came before it (`downNeedFull` for code, `transcriptsNeedFull` for conversations).
     * Then the next code bundle must be full (no prerequisite) and every conversation goes again. It clears itself the moment a
     * newer blob for that Mac exists, so it never needs an explicit reset.
     */
    public function state(int $user): array
    {
        $flagged = $this->needFull($user);
        return DB::table('cloud_sync_projects')->where('user_id', $user)->whereNull('removed_at')->orderBy('name')->get()->map(fn ($p) => ['name' => $p->name,
            'downSeq' => (int) $p->down_seq, 'transcriptsDownSeq' => (int) $p->transcripts_down_seq, 'upAppliedSeq' => (int) $p->up_applied_seq, 'upHead' => $p->up_applied_head,
            'downNeedFull' => isset($flagged[$p->id.'|code']), 'transcriptsNeedFull' => isset($flagged[$p->id.'|transcripts'])])->all();
    }

    /** `"<projectId>|<kind>" => true` for each (project, kind) whose newest blob to some Mac was refused with `needs_full`. */
    private function needFull(int $user): array
    {
        $rows = DB::table('cloud_sync_blobs as b')->where('b.user_id', $user)->where('b.direction', 'down')->whereNotNull('b.failed_at')
            ->where('b.failed_at', '>', now()->subDays(self::NEED_FULL_DAYS))->whereRaw('substr(b.error, 1, 10) = ?', ['needs_full'])
            ->whereNotExists(fn ($q) => $q->select(DB::raw(1))->from('cloud_sync_blobs as n')->whereColumn('n.project_id', 'b.project_id')->whereColumn('n.kind', 'b.kind')
                ->whereColumn('n.recipient_mac_id', 'b.recipient_mac_id')->where('n.direction', 'down')->whereColumn('n.seq', '>', 'b.seq'))
            ->get(['b.project_id', 'b.kind']);
        $out = [];
        foreach ($rows as $r) $out[$r->project_id.'|'.$r->kind] = true;
        return $out;
    }

    public function down(int $user, object $mac): array
    {
        return DB::table('cloud_sync_blobs')->join('cloud_sync_projects as p', 'p.id', '=', 'cloud_sync_blobs.project_id')->where('cloud_sync_blobs.user_id', $user)
            ->where('cloud_sync_blobs.direction', 'down')->where('cloud_sync_blobs.recipient_mac_id', $mac->id)->whereNull('cloud_sync_blobs.applied_at')->whereNull('cloud_sync_blobs.failed_at')
            ->orderBy('p.name')->orderBy('cloud_sync_blobs.kind')->orderBy('cloud_sync_blobs.seq')->get(['cloud_sync_blobs.*', 'p.name as project_name'])->map(fn ($b) => ['id' => $b->id, 'project' => $b->project_name,
                'kind' => $b->kind, 'seq' => (int) $b->seq, 'baseSeq' => (int) $b->base_seq, 'head' => $b->head, 'bytes' => (int) $b->bytes, 'sha256' => $b->sha256,
                'createdAt' => Carbon::parse($b->created_at)->toIso8601String()])->all();
    }

    /**
     * The Mac acknowledges a download. When it was a conversations upload and the Mac names the conversations it placed
     * (`$returned`: [{provider, id}], metadata only), each becomes a `returned` activity event: "your PC picked this up".
     *
     * A refusal (`applied:false`) is stored as `needs_full` unless the Mac says `needFull:false` (older Macs refused on any error,
     * transient ones included, and never said): the cloud computer's next state read then asks for a full bundle / all conversations
     * instead of another increment the Mac cannot use. A Mac that could only not reach the account never acknowledges at all.
     */
    public function ack(int $user, string $id, bool $applied, ?string $error, array $returned = [], ?bool $needFull = null): void
    {
        $b = DB::table('cloud_sync_blobs')->where('id', $id)->where('user_id', $user)->where('direction', 'down')->first() ?? Computers::fail('unknown_blob', 'Unknown download.', 404);
        if ($b->applied_at || $b->failed_at) return;
        // The marker is reserved; explicit false cannot accidentally request a resend through its free-text error.
        if ($needFull === false && str_starts_with((string) $error, 'needs_full')) $error = 'apply_failed: '.$error;
        $reason = ($needFull ?? true) ? 'needs_full'.($error !== null && $error !== '' ? ': '.$error : '') : $error;
        // Only one acknowledgement can settle the blob, even if another request read it before the winner committed.
        $changed = DB::table('cloud_sync_blobs')->where('id', $id)->whereNull('applied_at')->whereNull('failed_at')
            ->update($applied ? ['applied_at' => now(), 'updated_at' => now()]
                : ['failed_at' => now(), 'error' => $reason !== null ? mb_substr($reason, 0, 300) : null, 'updated_at' => now()]);
        if ($changed && $applied && $b->kind === 'transcripts' && $returned) $this->fileReturned($user, $b->project_id, $returned);
    }

    private function fileReturned(int $user, int $projectId, array $returned): void
    {
        $name = DB::table('cloud_sync_projects')->where('id', $projectId)->where('user_id', $user)->value('name');
        if (!is_string($name)) return;
        $events = app(\App\Services\CloudComputer\Activity\HostEvents::class);
        foreach (array_slice($returned, 0, 50) as $r) {
            if (is_array($r) && is_string($r['provider'] ?? null) && is_string($r['id'] ?? null)) $events->returned($user, $r['provider'], $r['id'], $name);
        }
    }
}
