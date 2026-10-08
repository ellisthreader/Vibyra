<?php
namespace App\Services\CloudComputer;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * One status per ticked project (docs/cloud-access-contract.md, `cloud.status`). The server decides from everything it knows
 * (the sync row, uploads still to apply, the computer's key and apply flag, what each Mac reports); the phone and the Mac only
 * display `phase` with the shared labels. First match wins, in the order of phase() below.
 */
class SyncStatus
{
    public const PHASES = ['waiting_mac', 'mac_paused', 'waiting_cloud', 'preparing', 'uploading', 'saved', 'applying', 'ready', 'diverged', 'skipped', 'needs_attention'];

    /** Plain sentences for failure codes (cloud computer, Mac, server). An unknown code gets `apply_failed`'s. */
    public const MESSAGES = [
        'apply_failed' => 'Vibyra Cloud couldn’t open the latest copy.',
        'download_failed' => 'Vibyra Cloud couldn’t download the latest copy.',
        'verify_failed' => 'The copy Vibyra Cloud received didn’t check out.',
        'decrypt_failed' => 'Vibyra Cloud couldn’t unlock the latest copy.',
        'disk_full' => 'Vibyra Cloud ran out of space for this project.',
        'quota_exceeded' => 'Your Cloud storage for projects is full.',
        'too_large' => 'This project is too big for Vibyra Cloud.',
        'no_files' => 'This project has no files to send.',
        'upload_failed' => 'Your Mac couldn’t send the latest copy.',
        'remove_failed' => 'Vibyra Cloud couldn’t remove its copy yet.',
    ];

    /** Where "Sync again" or the person has to act. key_mismatch / needs_full never reach the person (SyncQueue: resend). */
    public const FIX_ON = ['quota_exceeded' => 'phone', 'too_large' => 'mac', 'no_files' => 'mac', 'upload_failed' => 'mac'];

    public static function message(?string $code): string
    {
        return self::MESSAGES[$code] ?? self::MESSAGES['apply_failed'];
    }

    /** A stored failure reason (free text from older computers) as a known code. */
    public static function code(?string $reason): string
    {
        return $reason !== null && isset(self::MESSAGES[$reason]) ? $reason : 'apply_failed';
    }

    /** @return array<string, array> status by projectKey, for every sync row and every allowed decision. */
    public function forUser(int $user): array
    {
        $rows = DB::table('cloud_sync_projects')->where('user_id', $user)->whereNull('removed_at')->get()->keyBy('project_key');
        $allowed = app(AccessProjects::class)->allowedKeys($user);
        $pending = DB::table('cloud_sync_blobs')->where('user_id', $user)->where('direction', 'up')->whereNull('applied_at')->whereNull('failed_at')
            ->get(['project_id', 'kind', 'base_seq'])->groupBy('project_id');
        $keys = app(SyncKeys::class);
        $ctx = ['vmKey' => $keys->vmKey($user) !== null, 'applying' => $keys->applying($user), 'macs' => $keys->reports($user)->filter(fn ($r) => $r->online),
            'limit' => (int) config('cloud_workspaces.sync_max_blob_bytes')];
        $out = [];
        foreach (collect($allowed)->merge($rows->keys())->unique() as $key) $out[$key] = $this->phase($key, $rows[$key] ?? null, $pending[$rows[$key]->id ?? 0] ?? collect(), $ctx);
        return $out;
    }

    private function phase(string $key, ?object $s, $pending, array $ctx): array
    {
        $iso = fn ($v) => $v ? Carbon::parse($v)->toIso8601String() : null;
        $times = ['syncedAt' => $iso($s->up_synced_at ?? null), 'appliedAt' => $iso($s->applied_at ?? null)];
        $macs = $ctx['macs']; $awake = $macs->filter(fn ($r) => !($r->report['paused'] ?? false));
        $mine = $macs->map(fn ($r) => collect($r->report['projects'] ?? [])->firstWhere('projectKey', $key))->filter()->first();
        $current = $macs->map(fn ($r) => $r->current)->first(fn ($c) => ($c['projectKey'] ?? null) === $key);
        if ($s?->state === 'skipped') return ['phase' => 'skipped', 'code' => $s->reason ?: 'too_large', 'message' => self::message($s->reason ?: 'too_large'),
            'bytes' => isset($mine['bytes']) ? (int) $mine['bytes'] : null, 'limitBytes' => $ctx['limit']];
        if ($s?->state === 'error') return ['phase' => 'needs_attention', 'code' => self::code($s->reason), 'message' => self::message(self::code($s->reason)),
            'fixOn' => self::FIX_ON[self::code($s->reason)] ?? 'cloud'] + $times;
        if ($s?->state === 'diverged') return ['phase' => 'diverged'] + $times;
        $received = app(SyncUploadProgress::class)->current($s);
        if ($received) return ['phase' => 'uploading'] + $received + $times;
        if ($current) return ['phase' => 'uploading', 'sent' => (int) ($current['sent'] ?? 0), 'total' => (int) ($current['total'] ?? 0)] + $times;
        if (($mine['phase'] ?? null) === 'error') return ['phase' => 'needs_attention', 'code' => $mine['code'] ?? 'upload_failed',
            'message' => $mine['message'] ?? self::message($mine['code'] ?? 'upload_failed'), 'fixOn' => 'mac'] + $times;
        // Code to apply: after a reset only a full bundle counts (SyncQueue skips incrementals that lost their base).
        $code = $pending->filter(fn ($b) => $b->kind === 'code' && (!$s?->resync || (int) $b->base_seq === 0))->count();
        $transcripts = $pending->where('kind', 'transcripts')->count();
        if (!$s || (int) $s->up_seq === 0 || ($s->resync && $code === 0)) {
            if ($macs->isNotEmpty() && $awake->isEmpty()) return ['phase' => 'mac_paused'] + $times;
            if (!$ctx['vmKey']) return ['phase' => 'waiting_cloud'] + $times;
            return ['phase' => $awake->isNotEmpty() ? 'preparing' : 'waiting_mac'] + $times;
        }
        if ($code + $transcripts > 0) return ['phase' => $ctx['applying'] ? 'applying' : 'saved'] + $times;
        return ['phase' => 'ready'] + $times;
    }
}
