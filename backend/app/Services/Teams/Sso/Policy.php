<?php

namespace App\Services\Teams\Sso;

use App\Models\{OrganizationMember, OrganizationSso, User};
use App\Services\AgentRuns\ApiError;
use App\Services\Teams\{Roles, Teams};
use Illuminate\Http\Request;

/**
 * "Require SSO": when an organization with a verified domain turns it on, new password and provider sign-ins for addresses on that
 * domain are refused (the person signs in with SSO instead). Owners are exempt so a broken identity provider can never lock a team
 * out of its own settings. Sessions that already exist are not ended. It is checked where every session is minted.
 */
final class Policy
{
    public static function requiresSso(User $user): bool
    {
        if (!Teams::enabled()) return false;
        $domain = Domains::domainOf((string) $user->email);
        if ($domain === null) return false;
        $cfg = OrganizationSso::query()->where('verified_domain', $domain)->where('enabled', true)->where('require_sso', true)->first();
        if (!$cfg) return false;
        return OrganizationMember::query()->where('user_id', $user->id)->where('organization_id', $cfg->organization_id)->value('role') !== Roles::OWNER;
    }

    /** Called before a bearer session or a website session is created. SSO itself marks its request as verified. */
    public static function assertMaySignIn(User $user, ?Request $request = null): void
    {
        if ($request?->attributes->get('sso_verified') === true) return;
        if (self::requiresSso($user)) ApiError::throw(403, 'sso_required', 'Your organization requires single sign-on. Use "Sign in with SSO" on the website.');
    }
}
