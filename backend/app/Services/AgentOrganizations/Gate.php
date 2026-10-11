<?php
namespace App\Services\AgentOrganizations;
use App\Models\{OrganizationMember, User};
use App\Services\AgentRuns\ApiError;
use App\Services\Teams\{Teams, Roles};
final class Gate
{
    public static function enabled(): bool { return (bool) config('agents_v2.organisation_enabled') && Teams::enabled(); }
    public static function member(int $user, bool $lock = false, string $role = 'member'): OrganizationMember
    {
        if (!self::enabled()) ApiError::throw(404, 'organisation_disabled', 'Organisation Agents are unavailable.');
        $seat = OrganizationMember::query()->where('user_id', $user)->first();
        if (!$seat) ApiError::throw(403, 'organisation_membership_required', 'Join an organisation before using its Agents.');
        if ($lock) {
            Teams::lock($seat->organization_id);
            $seat = OrganizationMember::query()->whereKey($seat->id)->where('user_id', $user)->first();
            if (!$seat) ApiError::throw(403, 'organisation_membership_changed', 'Your organisation membership changed.');
        }
        if (($role === 'owner' && $seat->role !== Roles::OWNER)
            || ($role === 'manager' && !in_array($seat->role, [Roles::OWNER, Roles::ADMIN], true)))
            ApiError::throw(403, 'organisation_role_required', 'Your organisation role cannot make this change.');
        return $seat;
    }
}
