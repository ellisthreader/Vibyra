<?php
namespace App\Services\CloudWorkspaces;

use Illuminate\Support\Facades\{Cache, DB, Log, Storage};
use Illuminate\Support\Carbon;

final class Retention
{
    public function reconcile(object $original): void
    {
        if ($original->state === 'deleting') { app(Deletion::class)->delete($original); return; }
        // The cloud computer keeps its volume while in use; a long-stopped one is removed (see computer()).
        if (($original->kind ?? 'project') === 'computer') { $this->computer($original); return; }
        $lock = Cache::lock('cloud-provider:'.$original->id, 90); if (!$lock->get()) return;
        try {
            DB::transaction(function () use ($original) {
                app(\App\Services\Vibes\Wallet::class)->lock($original->user_id);
                $w = DB::table('cloud_workspaces')->where('id', $original->id)->firstOrFail();
                if ($w->state === 'stopped' && now()->gte(Carbon::parse($w->updated_at)->addDays(config('cloud_workspaces.stopped_days')))) {
                    // Verified independent archive survives destruction of the local Fly disk.
                    if ($w->checkpoint || $w->source !== 'github') app(Artifacts::class)->read($w);
                    app(CloudWorkspaceProvider::class)->destroy($w);
                    DB::table('cloud_workspaces')->where('id', $w->id)->update(['state' => 'archived', 'machine_id' => null, 'volume_id' => null, 'revision' => $w->revision + 1]);
                }
                if (!in_array($w->state, ['stopped', 'archived'], true)) return;
                if ($w->retention_until && now()->gte($w->retention_until)) {
                    app(CloudWorkspaceProvider::class)->destroy($w);
                    $this->prune($w, true);
                    DB::table('cloud_workspaces')->where('id', $w->id)->update(['state' => 'expired', 'machine_id' => null,
                        'volume_id' => null, 'checkpoint' => null, 'base_checkpoint' => null, 'revision' => $w->revision + 1]);
                } else $this->prune($w);
            }, 5);
        } finally { $lock->release(); }
    }
    public const WARN_DAYS = 3;

    /** A computer stopped for computer_stopped_days loses its Fly app/volume; the row stays (set up again = wake). */
    private function computer(object $original): void
    {
        if ($original->state !== 'stopped' || $original->retention_deleted_at) return;
        $lock = Cache::lock('cloud-provider:'.$original->id, 90); if (!$lock->get()) return;
        $removed = false; $warn = null;
        try {
            DB::transaction(function () use ($original, &$removed, &$warn) {
                app(\App\Services\Vibes\Wallet::class)->lock($original->user_id);
                $w = DB::table('cloud_workspaces')->where('id', $original->id)->lockForUpdate()->firstOrFail();
                // Never touch a computer that is not plainly stopped, or that never had a Fly resource.
                if ($w->state !== 'stopped' || $w->retention_deleted_at || !($w->machine_id || $w->volume_id || $w->generation > 0)) return;
                $due = Carbon::parse($w->updated_at)->addDays(max(7, (int) config('cloud_workspaces.computer_stopped_days')));
                if (now()->gte($due->copy()->subDays(self::WARN_DAYS)) && !$w->retention_warned_at) $warn = [$w, $due];
                if (now()->lt($due)) return;
                // Never remove a volume silently: a warning must have actually reached the owner at least WARN_DAYS ago.
                if (!$w->retention_warned_at || now()->lt(Carbon::parse($w->retention_warned_at)->addDays(self::WARN_DAYS))) {
                    if (!$w->retention_warned_at && Cache::add('cloud-retention:undelivered:'.$w->id, 1, 86400)) {
                        Log::warning('cloud.computer.retention_blocked', ['workspace' => $w->id, 'user' => $w->user_id, 'reason' => 'no_delivered_warning']);
                    }
                    return;
                }
                app(CloudWorkspaceProvider::class)->destroy($w);
                DB::table('cloud_workspaces')->where('id', $w->id)->update(['machine_id' => null, 'volume_id' => null, 'host_projects' => null,
                    'host_running' => 0, 'host_waiting' => 0, 'host_activity_at' => null, 'login_claude' => null, 'login_codex' => null,
                    'retention_deleted_at' => now(), 'revision' => $w->revision + 1]);
                $removed = true;
            }, 5);
        } finally { $lock->release(); }
        if ($warn) {
            [$w, $due] = $warn;
            try {
                $sent = app(Git\CloudEvents::class)->send($w, 'retention.warning', 'Your cloud computer will be removed',
                    'It has been asleep a while. Wake it before '.max(now()->addDays(self::WARN_DAYS), $due)->toFormattedDateString().' to keep its files and logins.');
                // Only a warning that was really queued for a device counts; disabled/throttled/opted-out/no phone means retry later.
                if ($sent['sent'] && ($sent['devices'] ?? 0) > 0) {
                    DB::table('cloud_workspaces')->where('id', $w->id)->whereNull('retention_warned_at')->update(['retention_warned_at' => now()]);
                } elseif (Cache::add('cloud-retention:undelivered-warning:'.$w->id, 1, 86400)) {
                    Log::warning('cloud.computer.retention_warning_undelivered', ['workspace' => $w->id, 'user' => $w->user_id, 'reason' => $sent['reason'] ?? 'no_device']);
                }
            } catch (\Throwable $e) { report($e); }
        }
        if ($removed && $original->remote_host_id) {
            // The old identity must not outlive the volume; waking again binds a fresh one.
            try {
                $host = \App\Models\RemoteHost::query()->find($original->remote_host_id);
                $user = \App\Models\User::query()->find($original->user_id);
                if ($host && $user) app(\App\Services\Remote\RemoteAccess::class)->revoke($user, $host->host_id);
            } catch (\Throwable $e) { report($e); }
        }
    }

    public function prune(object $w, bool $all = false): void
    {
        $disk = Storage::disk(config('cloud_workspaces.disk'));
        $keep = $all ? [] : array_filter([$w->base_checkpoint, $w->checkpoint,
            ...DB::table('cloud_checkpoints')->where('workspace_id', $w->id)->orderByDesc('id')->limit(config('cloud_workspaces.checkpoint_history'))->pluck('hash')->all()]);
        foreach (DB::table('cloud_checkpoints')->where('workspace_id', $w->id)->get() as $c) {
            if (in_array($c->hash, $keep, true)) continue;
            abort_unless($disk->delete($c->object_key) || !$disk->exists($c->object_key), 503, 'Checkpoint retention needs retry.');
            DB::table('cloud_checkpoints')->where('id', $c->id)->delete();
        }
    }
}
