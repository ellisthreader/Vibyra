<?php

namespace App\Services\Teams;

use App\Models\{Organization, OrganizationInvitation, OrganizationMember, User};
use App\Notifications\TeamInvitation;
use App\Services\AgentRuns\ApiError;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\{DB, Notification};
use Illuminate\Support\Str;

/**
 * Invitations by email link. The secret is `vti_` + 48 random letters and digits (about 285 bits) and is only ever emailed; the
 * database keeps its SHA-256. Accepting is a single atomic claim (UPDATE ... WHERE still pending), so a link works once even when
 * two requests race, and only the invited address, verified, can accept it: a forwarded link grants nothing to anyone else.
 */
final class Invitations
{
    private const FORMAT = '/^vti_[A-Za-z0-9]{48}$/D';

    public static function hash(string $token): string
    {
        return hash('sha256', $token);
    }

    public function invite(User $actorUser, string $email, string $role): OrganizationInvitation
    {
        $a = Teams::authorize($actorUser, 'invite');
        $email = self::email($email);
        if (!in_array($role, [Roles::ADMIN, Roles::MEMBER], true)) ApiError::throw(422, 'invalid_role', 'Invite someone as an admin or a member.');
        if ($role === Roles::ADMIN && !Roles::can($a->role, 'invite_admin')) ApiError::throw(403, 'forbidden', 'Only an owner can invite an admin.');
        $token = 'vti_'.Str::random(48);
        [$invite, $org] = DB::transaction(function () use ($a, $email, $role, $token) {
            $org = Teams::lock($a->organization_id);
            $actor = Teams::current($a, 'invite');
            if (!$actor || !Roles::can($actor->role, 'invite') || ($role === Roles::ADMIN && !Roles::can($actor->role, 'invite_admin')))
                ApiError::throw(403, 'forbidden', 'Your role cannot do that.');
            $existing = User::query()->where('email', $email)->first();
            if ($existing && OrganizationMember::query()->where('user_id', $existing->id)->where('organization_id', $org->id)->exists())
                ApiError::throw(409, 'already_member', 'That person is already in your team.');
            $open = OrganizationInvitation::query()->where('organization_id', $org->id)->whereNull('accepted_at')->whereNull('revoked_at')->where('expires_at', '>', now());
            if ((clone $open)->count() >= (int) config('teams.max_pending_invites')) ApiError::throw(409, 'too_many_invites', 'Revoke some open invitations first.');
            // Inviting the same address again replaces the earlier link (a resend); the old one stops working.
            (clone $open)->where('email', $email)->update(['revoked_at' => now()]);
            app(Seats::class)->assertRoomToInvite($org);
            $invite = (new OrganizationInvitation)->forceFill(['organization_id' => $org->id, 'email' => $email, 'role' => $role,
                'token_hash' => self::hash($token), 'invited_by' => $actor->user_id, 'expires_at' => now()->addDays((int) config('teams.invite_days'))]);
            $invite->save();
            Audit::record($actor->user_id, 'team.invite_sent', $org, $existing, ['email' => $email, 'role' => $role]);
            return [$invite, $org];
        });
        $this->send($org, $actorUser, $email, $token);
        return $invite;
    }

    public function revoke(User $actorUser, string $id): OrganizationInvitation
    {
        $a = Teams::authorize($actorUser, 'revoke_invite');
        return DB::transaction(function () use ($a, $id) {
            $org = Teams::lock($a->organization_id);
            Teams::current($a, 'revoke_invite');
            $invite = OrganizationInvitation::query()->where('organization_id', $org->id)->whereKey($id)->first()
                ?? ApiError::throw(404, 'invite_not_found', 'That invitation does not exist.');
            if ($invite->pending()) {
                $invite->forceFill(['revoked_at' => now()])->save();
                Audit::record($a->user_id, 'team.invite_revoked', $org, User::query()->where('email', $invite->email)->first(), ['email' => $invite->email]);
            }
            return $invite;
        });
    }

    public function accept(User $user, string $token): OrganizationMember
    {
        $invite = preg_match(self::FORMAT, $token) ? OrganizationInvitation::query()->where('token_hash', self::hash($token))->first() : null;
        if (!$invite) ApiError::throw(410, 'invite_invalid', 'This invitation is not valid.');
        $this->assertUsable($invite);
        if (!$user->hasVerifiedEmail() || strtolower((string) $user->email) !== $invite->email)
            ApiError::throw(403, 'wrong_account', 'This invitation was sent to '.$invite->email.'. Sign in with that verified address to accept it.');
        try {
            return DB::transaction(function () use ($invite, $user) {
                $org = Teams::lock($invite->organization_id);
                $claimed = OrganizationInvitation::query()->whereKey($invite->id)->whereNull('accepted_at')->whereNull('revoked_at')
                    ->where('expires_at', '>', now())->update(['accepted_at' => now(), 'accepted_by' => $user->id]);
                if ($claimed !== 1) $this->assertUsable($invite->fresh() ?? $invite);
                if ($claimed !== 1) ApiError::throw(410, 'invite_invalid', 'This invitation is not valid.');
                if (OrganizationMember::query()->where('user_id', $user->id)->exists())
                    ApiError::throw(409, 'already_in_team', 'You are already in a team. Leave it first.');
                app(Seats::class)->assertRoomToJoin($org);
                $m = (new OrganizationMember)->forceFill(['organization_id' => $org->id, 'user_id' => $user->id, 'role' => $invite->role, 'joined_via' => 'invite']);
                $m->save();
                Offboarding::restore($org->id, $user->id);
                app(MemberCaps::class)->seed($m, $org);
                Audit::record($user, 'team.member_joined', $org, $invite->invited_by, ['role' => $invite->role, 'via' => 'invite']);
                return $m;
            });
        } catch (UniqueConstraintViolationException) {
            ApiError::throw(409, 'already_in_team', 'You are already in a team. Leave it first.');
        }
    }

    /** What a signed-in person sees before accepting: the team and the address it was sent to, nothing about anyone else. */
    public function preview(string $token): array
    {
        $invite = preg_match(self::FORMAT, $token) ? OrganizationInvitation::query()->where('token_hash', self::hash($token))->first() : null;
        if (!$invite) ApiError::throw(410, 'invite_invalid', 'This invitation is not valid.');
        $this->assertUsable($invite);
        return ['team' => Organization::query()->whereKey($invite->organization_id)->value('name'), 'email' => $invite->email, 'role' => $invite->role,
            'expiresAt' => $invite->expires_at->toIso8601String()];
    }

    public static function email(string $email): string
    {
        $email = strtolower(trim($email));
        if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) ApiError::throw(422, 'invalid_email', 'Enter a valid email address.');
        return $email;
    }

    private function assertUsable(OrganizationInvitation $i): void
    {
        if ($i->accepted_at) ApiError::throw(410, 'invite_used', 'This invitation was already used.');
        if ($i->revoked_at) ApiError::throw(410, 'invite_revoked', 'This invitation was withdrawn.');
        if ($i->expires_at->isPast()) ApiError::throw(410, 'invite_expired', 'This invitation has expired. Ask for a new one.');
    }

    private function send(Organization $org, User $inviter, string $email, string $token): void
    {
        try {
            Notification::route('mail', $email)->notify(new TeamInvitation($org->name, $inviter->name ?: 'A teammate',
                url('/team/join').'#token='.$token, (int) config('teams.invite_days')));
        } catch (\Throwable $e) {
            report($e); // the invitation stands; inviting the address again sends a fresh link
        }
    }
}
