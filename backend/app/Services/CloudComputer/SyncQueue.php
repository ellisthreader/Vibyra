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
    public function applied(int $user, string $id, array $d): void
    {
        DB::transaction(function () use ($user, $id, $d) {
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

    public function state(int $user): array
    {
        return DB::table('cloud_sync_projects')->where('user_id', $user)->whereNull('removed_at')->orderBy('name')->get()->map(fn ($p) => ['name' => $p->name,
            'downSeq' => (int) $p->down_seq, 'transcriptsDownSeq' => (int) $p->transcripts_down_seq, 'upAppliedSeq' => (int) $p->up_applied_seq, 'upHead' => $p->up_applied_head])->all();
    }

    public function down(int $user, object $mac): array
    {
        return DB::table('cloud_sync_blobs')->join('cloud_sync_projects as p', 'p.id', '=', 'cloud_sync_blobs.project_id')->where('cloud_sync_blobs.user_id', $user)
            ->where('cloud_sync_blobs.direction', 'down')->where('cloud_sync_blobs.recipient_mac_id', $mac->id)->whereNull('cloud_sync_blobs.applied_at')->whereNull('cloud_sync_blobs.failed_at')
            ->orderBy('p.name')->orderBy('cloud_sync_blobs.kind')->orderBy('cloud_sync_blobs.seq')->get(['cloud_sync_blobs.*', 'p.name as project_name'])->map(fn ($b) => ['id' => $b->id, 'project' => $b->project_name,
                'kind' => $b->kind, 'seq' => (int) $b->seq, 'baseSeq' => (int) $b->base_seq, 'head' => $b->head, 'bytes' => (int) $b->bytes, 'sha256' => $b->sha256,
                'createdAt' => Carbon::parse($b->created_at)->toIso8601String()])->all();
    }

    public function ack(int $user, string $id, bool $applied, ?string $error): void
    {
        $b = DB::table('cloud_sync_blobs')->where('id', $id)->where('user_id', $user)->where('direction', 'down')->first() ?? Computers::fail('unknown_blob', 'Unknown download.', 404);
        if ($b->applied_at || $b->failed_at) return;
        DB::table('cloud_sync_blobs')->where('id', $id)->update($applied ? ['applied_at' => now(), 'updated_at' => now()]
            : ['failed_at' => now(), 'error' => $error !== null ? mb_substr($error, 0, 300) : null, 'updated_at' => now()]);
    }
}
