<?php
namespace App\Services\AgentOrganizations;
use App\Models\{Organization, OrganizationMember};
use Illuminate\Support\Facades\DB;
final class Overview
{
    public static function get(int $user): array
    {
        $base = ['enabled' => Gate::enabled(), 'team' => null, 'policy' => null, 'definitions' => [],
            'administrationUrl' => url('/account/team'), 'usage' => null];
        if (!Gate::enabled()) return $base;
        $seat = OrganizationMember::query()->where('user_id', $user)->first(); if (!$seat) return $base;
        $org = Organization::query()->findOrFail($seat->organization_id); $manage = in_array($seat->role, ['owner', 'admin'], true);
        $p = Policies::get($org->id);
        return [...$base, 'team' => ['id' => $org->id, 'name' => $org->name, 'role' => $seat->role,
            'canManage' => $manage, 'canAdminister' => $seat->role === 'owner'], 'policy' => Policies::payload($p),
            'definitions' => DB::table('agent_organisation_definitions')->where('organization_id', $org->id)
                ->orderByDesc('updated_at')->limit(100)->get()->map(fn ($d) => Definitions::payload($d, $user, $seat->id))->all(),
            'usage' => $manage ? ['todayTasks' => DB::table('agent_organisation_runs')->where('organization_id', $org->id)
                ->where('created_at', '>=', now()->utc()->startOfDay())->count(), 'dailyTaskLimit' => (int) $p->daily_task_limit] : null];
    }
}
