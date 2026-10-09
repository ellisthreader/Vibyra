<?php
namespace App\Services\AgentRuns\Jobs;
use App\Models\User;
use App\Services\AgentRuns\ApiError;
use App\Services\Membership\PlanLimits;
/** Recheck the existing entitlement policy before new nonordered work. */
final class Membership
{
    public static function allows(int $userId): bool
    {
        $user = User::find($userId);
        return $user && app(PlanLimits::class)->allows($user, 'agents');
    }
    public static function require(int $userId): void
    {
        if (!self::allows($userId)) ApiError::throw(402, 'membership_required', 'Renew Pro before continuing this Agent job.');
    }
}
