<?php
namespace App\Services\AgentRuns\Cloud;

use App\Models\VibyraSession;
use App\Services\CloudComputer\Computers;
use App\Services\CloudWorkspaces\Eligibility;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Agent-only review quotes use the deployed fixed Cloud computer tariff. No Preview dependency. */
final class ComputeQuotes
{
    public function create(VibyraSession $s, array $d): array
    {
        return DB::transaction(function () use ($s, $d) {
            app(\App\Services\Vibes\Wallet::class)->lock($s->user_id);
            app(Policies::class)->enabled(); app(Eligibility::class)->authorize($s->user_id, true);
            $w = app(Computers::class)->find($s->user_id);
            abort_unless($w && in_array($w->state, ['ready', 'stopped', 'archived', 'expired'], true), 409, 'Wait for Cloud to finish changing state.');
            abort_unless($d['profile'] === 'standard', 422, 'Cloud Agents use the Standard computer.');
            $p = $this->price($w) + ['workspaceId' => $w->id, 'deviceId' => $d['deviceId'],
                'budgetUnits' => (int) $d['budgetUnits'], 'deadlineSeconds' => (int) $d['deadlineSeconds']];
            abort_unless($p['budgetUnits'] > 0 && $p['budgetUnits'] <= config('cloud_workspaces.max_budget_units')
                && $p['deadlineSeconds'] >= 60 && $p['deadlineSeconds'] <= config('cloud_workspaces.max_background_seconds'), 422, 'Compute limits exceed the available allowance.');
            $id = (string) Str::uuid();
            DB::table('agent_cloud_quotes')->insert(['id' => $id, 'user_id' => $s->user_id, 'workspace_id' => $w->id,
                'session_id' => $s->id, 'device_id' => $d['deviceId'], 'payload' => json_encode($p),
                'expires_at' => now()->addMinutes(2), 'created_at' => now()]);
            return ['id' => $id, ...$p, 'unitScale' => 10000, 'expiresAt' => now()->addMinutes(2)->timestamp];
        }, 5);
    }

    public function price(object $w): array
    {
        $units = (int) config('cloud_workspaces.units_per_hour');
        $cost = (int) config('cloud_workspaces.provider_micro_per_hour');
        abort_unless($units > 0 && $cost > 0 && $units >= $cost && config('cloud_workspaces.tariff_version'), 503, 'Cloud pricing needs verification.');
        return ['trial' => false, 'native' => false, 'profile' => 'standard', 'cpuKind' => 'performance', 'cpus' => 2, 'memoryMb' => 4096,
            'unitsPerHour' => $units, 'providerMicroPerHour' => $cost, 'tariffVersion' => config('cloud_workspaces.tariff_version'),
            'region' => $w->region ?: config('cloud_workspaces.region')];
    }
}
