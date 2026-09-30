<?php
namespace App\Services\CloudWorkspaces;

use Illuminate\Support\Facades\{Cache, DB, Storage};
use Illuminate\Support\Carbon;

final class Retention
{
    public function reconcile(object $original): void
    {
        if ($original->state === 'deleting') { app(Deletion::class)->delete($original); return; }
        $lock = Cache::lock('cloud-provider:'.$original->id, 90); if (!$lock->get()) return;
        try {
            DB::transaction(function () use ($original) {
                app(\App\Services\Vibes\Wallet::class)->lock($original->user_id);
                $w = DB::table('cloud_workspaces')->where('id', $original->id)->firstOrFail();
                if ($w->state === 'stopped' && now()->gte(Carbon::parse($w->updated_at)->addDays(config('cloud_workspaces.stopped_days')))) {
                    // Verified independent archive survives destruction of the local Fly disk.
                    app(Artifacts::class)->read($w); app(CloudWorkspaceProvider::class)->destroy($w);
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
