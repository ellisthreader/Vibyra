<?php
namespace App\Services\CloudWorkspaces;

use Illuminate\Support\Facades\{Cache, DB, Log};
use Illuminate\Support\Carbon;

final class Lifecycle
{
    public function reconcile(string $id): void
    {
        $lock = Cache::lock('cloud-provider:'.$id, 90);
        if (!$lock->get()) return;
        try {
            $w = DB::table('cloud_workspaces')->where('id', $id)->first();
            if (!$w) return;
            $provider = app(CloudWorkspaceProvider::class);
            if ($w->state === 'starting') {
                if (now()->gte($w->deadline_at) || now()->gte(Carbon::parse($w->updated_at)->addSeconds(config('cloud_workspaces.boot_timeout_seconds')))) {
                    $w = app(Shutdown::class)->request($w->user_id, $id, 'boot_timeout');
                } else {
                    $resources = $provider->configure($w);
                    DB::table('cloud_workspaces')->where('id', $id)->where('generation', $w->generation)
                        ->update(['machine_id' => $resources['machine'], 'volume_id' => $resources['volume']]);
                    return;
                }
            }
            if ($w->state === 'ready') {
                $reason = $this->stopReason($w);
                if (!$reason) return;
                $w = app(Shutdown::class)->request($w->user_id, $id, $reason);
            }
            if (in_array($w->state, ['stopping', 'recovery_required'], true)) {
                // Resolve an ambiguous create first; the same named generation is never replayed as a new one.
                if (!$w->machine_id) {
                    $resources = $provider->recover($w);
                    if (!$resources) { app(Shutdown::class)->confirm($w); return; }
                    DB::table('cloud_workspaces')->where('id', $id)->update(['machine_id' => $resources['machine'], 'volume_id' => $resources['volume']]);
                    $w = DB::table('cloud_workspaces')->where('id', $id)->first();
                }
                $state = $provider->inspect($w);
                if (in_array($state, ['stopped', 'destroyed', 'absent'], true)) { app(Shutdown::class)->confirm($w); return; }
                $saved = $w->checkpoint_at && $w->stop_requested_at && Carbon::parse($w->checkpoint_at)->gte($w->stop_requested_at);
                if ($saved || !$w->ready_at || !$w->stop_requested_at || now()->gte(Carbon::parse($w->stop_requested_at)->addSeconds(config('cloud_workspaces.stop_timeout_seconds')))) {
                    $provider->stop($w);
                    if (in_array($provider->inspect($w), ['stopped', 'destroyed', 'absent'], true)) app(Shutdown::class)->confirm($w);
                }
            }
        } catch (\Throwable $error) {
            // Provider responses may contain machine bootstrap credentials; never log response bodies.
            Log::error('cloud.reconcile.failed', ['workspace' => $id, 'exception' => $error::class]);
            throw new \RuntimeException('Cloud resource reconciliation needs retry or operator review.');
        } finally { $lock->release(); }
    }
    public function stopReason(object $w): ?string
    {
        if (!$w->lease_until || now()->gte($w->lease_until)) return 'compute_lease_expired';
        if (now()->gte($w->deadline_at)) return 'deadline';
        try { app(Eligibility::class)->authorize($w->user_id); }
        catch (\Throwable) { return 'entitlement_or_payment'; }
        if (!app(Access::class)->deviceActive($w->device_id, $w->device_generation, $w->user_id)) return 'authority_revoked';
        $busy = DB::table('cloud_actions')->where('workspace_id', $w->id)->whereIn('state', ['queued', 'running'])->exists()
            || DB::table('vibes_turns')->where('chat_id', $w->chat_id)->whereNull('settled_at')->exists();
        if (!$busy && now()->gte(Carbon::parse($w->last_activity_at)->addSeconds(config('cloud_workspaces.idle_seconds')))) return 'idle';
        return null;
    }
}
