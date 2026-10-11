<?php

namespace App\Services\Teams;

use App\Models\{Organization, OrganizationMember, User};
use App\Services\AgentRuns\ApiError;
use App\Services\Membership\Entitlements;

/** Entry points shared by every Teams request: the feature switch, the plan gate, who the caller is and which team they are in. */
final class Teams
{
    public static function enabled(): bool
    {
        return (bool) config('teams.enabled');
    }

    /** A signed-in, non-guest account; 404 while Teams is off so the feature does not exist to a client that is not opted in. */
    public static function account(?User $user): User
    {
        if (!self::enabled()) ApiError::throw(404, 'not_available', 'Teams is not switched on.');
        if (!$user || $user->isGuest()) ApiError::throw(401, 'login_required', 'Please log in.');
        return $user;
    }

    /** The caller's membership, or a 404 that is identical whether the team is missing or simply not theirs (no probing by id). */
    public static function membership(User $user): OrganizationMember
    {
        return OrganizationMember::query()->where('user_id', $user->id)->first()
            ?? ApiError::throw(404, 'no_team', 'You are not in a team.');
    }

    /** The caller's membership, which must hold `$action`; the organization id in a URL is checked against it, never trusted. */
    public static function authorize(User $user, string $action, ?string $organizationId = null): OrganizationMember
    {
        $m = self::membership($user);
        if ($organizationId !== null && $m->organization_id !== $organizationId) ApiError::throw(404, 'no_team', 'You are not in a team.');
        if (!Roles::can($m->role, $action)) ApiError::throw(403, 'forbidden', 'Your role cannot do that.');
        return $m;
    }

    /** Recheck an earlier permission after taking the organisation mutation lock. */
    public static function current(OrganizationMember $prior, string $action): OrganizationMember
    {
        $m = OrganizationMember::query()->whereKey($prior->id)->where('organization_id', $prior->organization_id)
            ->where('user_id', $prior->user_id)->first();
        if (!$m || !Roles::can($m->role, $action)) ApiError::throw(403, 'forbidden', 'Your team role changed. Refresh and try again.');
        return $m;
    }

    /** Plan gate `teams`: only creating a team is gated, and only when TEAMS_PLAN_GATE is on. Joining is never gated. */
    public static function mayCreate(User $user): bool
    {
        if (!config('teams.plan_gate')) return true;
        return in_array(app(Entitlements::class)->for($user)['plan'] ?? 'free', (array) config('teams.plans'), true);
    }

    /** Lock the organization row: every membership change takes it first, which is what makes last-owner and seat checks race-free. */
    public static function lock(string $organizationId): Organization
    {
        return Organization::query()->whereKey($organizationId)->lockForUpdate()->firstOrFail();
    }
}
