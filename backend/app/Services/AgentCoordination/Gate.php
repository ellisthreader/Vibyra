<?php
namespace App\Services\AgentCoordination;
use App\Models\User;
use App\Services\AgentRuns\{Access, ApiError};
use App\Services\Membership\PlanLimits;
final class Gate
{
    public static function enabled(): void
    {
        if (!config('agents_v2.coordination_enabled')) ApiError::throw(503, 'coordination_disabled', 'Agent groups are not enabled.');
    }
    public static function require(int $userId): void
    {
        self::enabled(); app(Access::class)->require($userId);
        $user = User::find($userId);
        if (!$user || !app(PlanLimits::class)->allows($user, 'agents')) ApiError::throw(402, 'plan_required', 'Agent groups need Pro.');
    }
    public static function revision(int $actual, int $expected): void
    {
        if ($actual !== $expected) ApiError::throw(409, 'coordination_changed', 'This group or workflow changed. Refresh before deciding.');
    }
}
