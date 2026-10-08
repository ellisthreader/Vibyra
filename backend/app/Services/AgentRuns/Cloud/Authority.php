<?php
namespace App\Services\AgentRuns\Cloud;

use App\Models\AgentV2\RuntimeBinding;
use App\Services\AgentRuns\ApiError;
use Illuminate\Support\Facades\DB;

final class Authority
{
    public static function cloud(RuntimeBinding $b): bool { return $b->execution_target === 'cloud'; }

    public function check(RuntimeBinding $b): void
    {
        if (!self::cloud($b)) return;
        $locked = DB::transactionLevel() > 0;
        $w = DB::table('cloud_workspaces')->where('id', $b->cloud_workspace_id)->where('user_id', $b->user_id)
            ->when($locked, fn ($q) => $q->lockForUpdate())->first();
        app(Policies::class)->current($b, $locked);
        $fresh = RuntimeBinding::whereKey($b->id)->whereNull('revoked_at')->first();
        if (!$fresh || $fresh->runner_key_hash !== $b->runner_key_hash || $fresh->revision !== $b->revision)
            ApiError::throw(409, 'cloud_binding_changed', 'Cloud AI account selection changed.');
        if (!$w || $w->kind !== 'computer' || $w->state !== 'ready' || (int) $w->generation !== (int) $b->cloud_generation
            || !app(Accounts::class)->selected($b, (int) $w->generation) || !$w->lease_until || now()->gte($w->lease_until) || now()->gte($w->deadline_at))
            ApiError::throw(409, 'cloud_compute_unavailable', 'Cloud compute authority is not active.');
        if ($w->remote_host_id && DB::table('remote_hosts')->where('id', $w->remote_host_id)->whereNotNull('revoked_at')->exists())
            ApiError::throw(409, 'cloud_host_revoked', 'The cloud computer was removed.');
    }

}
