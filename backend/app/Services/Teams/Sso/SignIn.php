<?php

namespace App\Services\Teams\Sso;

use App\Models\{Organization, OrganizationMember, OrganizationSso, User, VibyraSession};
use App\Services\Auth\TwoFactor;
use App\Services\Platform\AccountActivity;
use App\Services\Teams\{Audit, MemberCaps, Roles, Seats, Teams};
use Illuminate\Support\Facades\{DB, Hash};
use Illuminate\Support\Str;

/**
 * What a verified ID token means for an account: the person is found by the bound (organization, subject) identity or, the first
 * time, by the email on the organization's verified domain, then seated in the team just in time. A Vibyra account must already exist
 * (creating one has terms, age and market checks that an identity provider cannot answer); `account_required` says so.
 */
final class SignIn
{
    /** @param array{subject:string,email:string,name:?string} $id */
    public function resolve(OrganizationSso $cfg, array $id): User
    {
        $org = Organization::query()->findOrFail($cfg->organization_id);
        return DB::transaction(function () use ($cfg, $org, $id) {
            Teams::lock($org->id);
            $fresh = OrganizationSso::query()->find($org->id);
            if (!$fresh) throw new SsoException('sso_unavailable');
            Configuration::requireCurrent($fresh, Configuration::hash($cfg));
            $bound = DB::table('organization_sso_identities')->where('organization_id', $org->id)->where('subject', $id['subject'])->first();
            $user = $bound ? User::query()->find($bound->user_id) : User::query()->where('email', $id['email'])->first();
            if (!$user) throw new SsoException('account_required', 'No Vibyra account for that email.');
            if (\App\Services\Teams\Offboarding::blocked($org->id, $user->id)) throw new SsoException('membership_removed');
            if ($user->isGuest() || strcasecmp((string) $user->email, $id['email']) !== 0) throw new SsoException('sso_identity');
            if (app(TwoFactor::class)->enabled($user)) throw new SsoException('two_factor');
            if (!$bound) $this->link($org, $user, $id);
            $this->seat($org, $user);
            DB::table('organization_sso_identities')->where('organization_id', $org->id)->where('user_id', $user->id)->update(['last_sign_in_at' => now(), 'updated_at' => now()]);
            AccountActivity::record($user, 'sign_in', ['channel' => 'website', 'method' => 'sso', 'org' => $org->name]);
            return $user;
        });
    }

    /** First sign-in for this person through this team: bind the identity. Accounts guarded by a second factor keep that sign-in. */
    private function link(Organization $org, User $user, array $id): void
    {
        if ($user->isGuest()) throw new SsoException('account_required', 'Guests cannot use SSO.');
        if (app(TwoFactor::class)->enabled($user)) throw new SsoException('two_factor', 'Two-factor accounts must sign in with their password and code first.');
        if (DB::table('organization_sso_identities')->where('organization_id', $org->id)->where('user_id', $user->id)->exists())
            throw new SsoException('sso_identity', 'This account is bound to a different identity.');
        if ($user->email_verified_at === null) {
            // The IdP proves control of this mailbox. Whoever registered the address first and set a password has not: end their access.
            $user->forceFill(['email_verified_at' => now(), 'password' => Str::random(48)])->save();
            VibyraSession::query()->where('user_id', $user->id)->whereNull('revoked_at')->update(['revoked_at' => now(), 'revocation_reason' => 'sso_link']);
        }
        DB::table('organization_sso_identities')->insert(['organization_id' => $org->id, 'user_id' => $user->id, 'subject' => $id['subject'],
            'created_at' => now(), 'updated_at' => now()]);
        Audit::record($user, 'team.sso_linked', $org);
    }

    /** Just-in-time membership: seat the person as a member the first time, refuse if they already sit in another team or none is free. */
    private function seat(Organization $org, User $user): void
    {
        $m = OrganizationMember::query()->where('user_id', $user->id)->first();
        if ($m) {
            if ($m->organization_id !== $org->id) throw new SsoException('other_team', 'In another team.');
            return;
        }
        try {
            app(Seats::class)->assertRoomToJoin($org);
        } catch (\Illuminate\Http\Exceptions\HttpResponseException) {
            throw new SsoException('no_seats', 'No free seat.');
        }
        $m = (new OrganizationMember)->forceFill(['organization_id' => $org->id, 'user_id' => $user->id, 'role' => Roles::MEMBER, 'joined_via' => 'sso']);
        $m->save();
        app(MemberCaps::class)->seed($m, $org);
        Audit::record($user, 'team.member_joined', $org, null, ['role' => Roles::MEMBER, 'via' => 'sso']);
    }
}
