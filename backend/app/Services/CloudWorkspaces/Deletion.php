<?php
namespace App\Services\CloudWorkspaces;

use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\{Cache, DB, Storage};

final class Deletion
{
    public function delete(object $original): void
    {
        $lock = Cache::lock('cloud-provider:'.$original->id, 90);
        abort_unless($lock->get(), 409, 'Cloud resources are changing. Try deletion again shortly.');
        try {
            $w = DB::transaction(function () use ($original) {
                app(Wallet::class)->lock($original->user_id);
                $w = DB::table('cloud_workspaces')->where('id', $original->id)->firstOrFail();
                if ($w->state === 'deleted') return $w;
                abort_unless(in_array($w->state, ['draft', 'stopped', 'archived', 'expired', 'deleting'], true), 409, 'Stop the computer before deleting its project.');
                abort_if(DB::table('cloud_reservations')->where('workspace_id', $w->id)->whereNull('settled_at')->exists()
                    || ($w->chat_id && DB::table('vibes_turns')->where('chat_id', $w->chat_id)->whereNull('settled_at')->exists()), 409, 'Wait for usage reconciliation before deletion.');
                DB::table('cloud_workspaces')->where('id', $w->id)->update(['state' => 'deleting', 'runtime_token_hash' => null, 'revision' => $w->revision + 1]);
                return $w;
            }, 5);
            if ($w->state === 'deleted') return;
            if ($w->machine_id || $w->volume_id || $w->generation > 0) app(CloudWorkspaceProvider::class)->destroy($w);
            $disk = Storage::disk(config('cloud_workspaces.disk'));
            foreach (DB::table('cloud_checkpoints')->where('workspace_id', $w->id)->get() as $c) {
                abort_unless($disk->delete($c->object_key) || !$disk->exists($c->object_key), 503, 'Project deletion needs retry.');
            }
            DB::table('cloud_checkpoints')->where('workspace_id', $w->id)->delete();
            DB::table('cloud_actions')->where('workspace_id', $w->id)->update(['arguments' => '{}', 'result' => null, 'state' => 'deleted']);
            DB::table('cloud_preview_tickets')->where('workspace_id', $w->id)->delete();
            DB::table('cloud_quotes')->where('workspace_id', $w->id)->update(['payload' => '{}']);
            DB::table('cloud_workspaces')->where('id', $w->id)->update(['state' => 'deleted', 'checkpoint' => null, 'base_checkpoint' => null,
                'bootstrap_secret' => null, 'runtime_secret' => null, 'updated_at' => now()]);
        } finally { $lock->release(); }
    }
}
