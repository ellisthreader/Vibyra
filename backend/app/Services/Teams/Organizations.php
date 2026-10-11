<?php

namespace App\Services\Teams;

use App\Models\{Organization, OrganizationMember, User};
use App\Services\AgentRuns\ApiError;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

/**
 * Create, rename, leave, remove, change a role, hand over. Every change that can affect who may act takes the organization row
 * lock first and re-reads what it checks under it, so "the last owner cannot leave" and the role rules hold when requests race.
 */
final class Organizations
{
    public function create(User $user, string $name): Organization
    {
        $name = self::name($name);
        try {
            return DB::transaction(function () use ($user, $name) {
                if (OrganizationMember::query()->where('user_id', $user->id)->exists())
                    ApiError::throw(409, 'already_in_team', 'You are already in a team. Leave it first.');
                $org = (new Organization)->forceFill(['name' => $name]);
                $org->save();
                (new OrganizationMember)->forceFill(['organization_id' => $org->id, 'user_id' => $user->id, 'role' => Roles::OWNER, 'joined_via' => 'create'])->save();
                Audit::record($user, 'team.created', $org);
                return $org;
            });
        } catch (UniqueConstraintViolationException) {
            ApiError::throw(409, 'already_in_team', 'You are already in a team. Leave it first.');
        }
    }

    public function rename(OrganizationMember $actor, string $name): Organization
    {
        $name = self::name($name);
        return DB::transaction(function () use ($actor, $name) {
            $org = Teams::lock($actor->organization_id);
            $this->current($actor, 'rename');
            $old = $org->name;
            $org->forceFill(['name' => $name])->save();
            Audit::record($actor->user_id, 'team.renamed', $org, null, ['from' => $old]);
            return $org;
        });
    }

    public function leave(User $user): void
    {
        $m = Teams::membership($user);
        DB::transaction(function () use ($user, $m) {
            $org = Teams::lock($m->organization_id);
            $mine = OrganizationMember::query()->where('user_id', $user->id)->where('organization_id', $org->id)->first();
            if (!$mine) return; // already gone: leaving twice is not an error
            if ($mine->role === Roles::OWNER && $this->owners($org) <= 1)
                ApiError::throw(409, 'last_owner', 'You are the only owner. Hand the team to someone else before you leave.');
            $this->drop($mine, $org);
            Audit::record($user, 'team.member_left', $org);
        });
    }

    public function remove(User $actorUser, int $memberId): void
    {
        $a = Teams::authorize($actorUser, 'remove');
        DB::transaction(function () use ($a, $memberId) {
            $org = Teams::lock($a->organization_id);
            $actor = $this->current($a, 'remove');
            $target = OrganizationMember::query()->where('organization_id', $org->id)->whereKey($memberId)->first()
                ?? ApiError::throw(404, 'member_not_found', 'That person is not in your team.');
            if ($target->user_id === $actor->user_id) ApiError::throw(422, 'use_leave', 'Use Leave to remove yourself.');
            if (!Roles::outranks($actor->role, $target->role)) ApiError::throw(403, 'forbidden', 'Your role cannot remove that person.');
            $this->drop($target, $org);
            Audit::record($actor->user_id, 'team.member_removed', $org, $target->user_id, ['role' => $target->role]);
        });
    }

    public function changeRole(User $actorUser, int $memberId, string $role): OrganizationMember
    {
        $a = Teams::authorize($actorUser, 'change_role');
        if (!in_array($role, Roles::ALL, true)) ApiError::throw(422, 'invalid_role', 'Choose owner, admin or member.');
        return DB::transaction(function () use ($a, $memberId, $role) {
            $org = Teams::lock($a->organization_id);
            $actor = $this->current($a, 'change_role');
            $target = OrganizationMember::query()->where('organization_id', $org->id)->whereKey($memberId)->first()
                ?? ApiError::throw(404, 'member_not_found', 'That person is not in your team.');
            if ($target->user_id === $actor->user_id) ApiError::throw(422, 'not_yourself', 'Ask another owner to change your role, or hand the team over.');
            $from = $target->role;
            if ($from !== $role) {
                $target->forceFill(['role' => $role])->save();
                Audit::record($actor->user_id, 'team.role_changed', $org, $target->user_id, ['from' => $from, 'to' => $role]);
            }
            return $target;
        });
    }

    /** The owner becomes an admin and the chosen member becomes an owner, as one change. */
    public function transfer(User $actorUser, int $memberId): void
    {
        $a = Teams::authorize($actorUser, 'transfer');
        DB::transaction(function () use ($a, $memberId) {
            $org = Teams::lock($a->organization_id);
            $actor = $this->current($a, 'transfer');
            $target = OrganizationMember::query()->where('organization_id', $org->id)->whereKey($memberId)->first()
                ?? ApiError::throw(404, 'member_not_found', 'That person is not in your team.');
            if ($target->user_id === $actor->user_id) ApiError::throw(422, 'not_yourself', 'Choose someone else.');
            $target->forceFill(['role' => Roles::OWNER])->save();
            $actor->forceFill(['role' => Roles::ADMIN])->save();
            Audit::record($actor->user_id, 'team.ownership_transferred', $org, $target->user_id);
        });
    }

    public static function name(string $name): string
    {
        $name = trim(preg_replace('/[\x00-\x1f\x7f]/u', '', $name) ?? '');
        if ($name === '' || mb_strlen($name) > (int) config('teams.name_max')) ApiError::throw(422, 'invalid_name', 'Give the team a name of up to '.(int) config('teams.name_max').' characters.');
        return $name;
    }

    public function owners(Organization $org): int
    {
        return OrganizationMember::query()->where('organization_id', $org->id)->where('role', Roles::OWNER)->count();
    }

    /** Re-read the actor's own seat under the lock: a role taken away a moment ago must not still authorize this request. */
    private function current(OrganizationMember $actor, string $action): OrganizationMember
    {
        return Teams::current($actor, $action);
    }

    /** Take a seat away: the member row and the SSO identity bound through this team go together. */
    private function drop(OrganizationMember $m, Organization $org): void
    {
        Offboarding::record($org->id, $m->user_id);
        DB::table('organization_sso_identities')->where('organization_id', $org->id)->where('user_id', $m->user_id)->delete();
        $m->delete();
    }
}
