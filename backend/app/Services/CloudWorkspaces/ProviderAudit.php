<?php
namespace App\Services\CloudWorkspaces;

use Illuminate\Support\Facades\{Cache, DB, Log};

final class ProviderAudit
{
    public function run(): bool
    {
        $lock = Cache::lock('cloud-provider-audit', 110); if (!$lock->get()) return false;
        // Fail closed before network work. A crash or provider outage leaves admission blocked.
        DB::table('cloud_workspace_control')->where('id', 1)->update(['admission_blocked' => true, 'audit_reason' => 'audit_pending']);
        try {
            $provider = app(FlyProvider::class); $issues = [];
            foreach ($provider->apps() as $a) {
                if (!str_starts_with($a['name'] ?? '', 'vibyra-ws-')) continue;
                $w = DB::table('cloud_workspaces')->where('app_name', $a['name'])->first();
                if (!$w || ($a['network'] ?? null) !== $a['name']) { $issues[] = 'unknown_app_or_network'; continue; }
                $resourceLock = Cache::lock('cloud-provider:'.$w->id, 90);
                if (!$resourceLock->get()) { $issues[] = 'resource_busy'; continue; }
                try {
                    $currentCount = 0;
                    foreach ($provider->machines($w) as $m) {
                        $meta = $m['config']['metadata'] ?? [];
                        $q = DB::table('cloud_quotes')->where('id', $meta['vibyra_operation'] ?? '')
                            ->where('workspace_id', $w->id)->whereNotNull('accepted_at')->first();
                        $retired = in_array($w->state, ['deleted', 'expired'], true) && $w->operation_id === ($meta['vibyra_operation'] ?? null);
                        $policy = $q ? json_decode($q->payload, true) : null;
                        if ($retired && !isset($policy['generation'])) $policy = ['generation' => $w->generation];
                        // A cloud computer wakes without a quote: its own machine at a generation it has reached is known.
                        $generation = (string) ($meta['vibyra_generation'] ?? '');
                        if (!$policy && ($w->kind ?? 'project') === 'computer' && ctype_digit($generation)
                            && (int) $generation >= 1 && (int) $generation <= (int) $w->generation) $policy = ['generation' => (int) $generation];
                        if (($meta['vibyra_workspace'] ?? null) !== $w->id || !$policy
                            || (string) ($meta['vibyra_generation'] ?? '') !== (string) ($policy['generation'] ?? '')) {
                            $issues[] = 'unknown_machine'; continue;
                        }
                        $current = $w->operation_id === ($meta['vibyra_operation'] ?? null) && (int) $w->generation === (int) $policy['generation'];
                        if ($current && ++$currentCount > 1) $issues[] = 'duplicate_generation';
                        $extra = $current && $w->machine_id && $w->machine_id !== $m['id'];
                        if (!$current || $extra || !in_array($w->state, Workspaces::ACTIVE, true)) {
                            $provider->stopResource($w, $m);
                            if (!in_array($m['state'] ?? '', ['stopped', 'destroyed'], true)) $issues[] = 'stale_machine_stopping';
                        }
                    }
                } finally { $resourceLock->release(); }
            }
            DB::table('cloud_workspace_control')->where('id', 1)->update(['provider_audited_at' => now(),
                'admission_blocked' => (bool) $issues, 'audit_reason' => $issues[0] ?? null, 'updated_at' => now()]);
            return !$issues;
        } catch (\Throwable $e) {
            DB::table('cloud_workspace_control')->where('id', 1)->update(['audit_reason' => 'provider_unavailable']);
            Log::error('cloud.audit.failed', ['exception' => $e::class]); return false;
        } finally { $lock->release(); }
    }
}
