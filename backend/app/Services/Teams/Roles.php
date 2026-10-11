<?php

namespace App\Services\Teams;

/**
 * The role permission matrix, in one place. A member sees the team; an admin runs people (invite members, remove members,
 * per-member caps, rename); only an owner changes roles, invites admins, configures SSO or hands the team over.
 * An actor may act on a target only when strictly outranking them (an owner may act on anyone but their own seat).
 */
final class Roles
{
    public const OWNER = 'owner';
    public const ADMIN = 'admin';
    public const MEMBER = 'member';
    public const ALL = [self::OWNER, self::ADMIN, self::MEMBER];

    private const RANK = [self::OWNER => 3, self::ADMIN => 2, self::MEMBER => 1];
    private const CAN = [
        'view' => self::ALL,
        'leave' => self::ALL,
        'rename' => [self::OWNER, self::ADMIN],
        'invite' => [self::OWNER, self::ADMIN],
        'invite_admin' => [self::OWNER],
        'revoke_invite' => [self::OWNER, self::ADMIN],
        'remove' => [self::OWNER, self::ADMIN],
        'set_cap' => [self::OWNER, self::ADMIN],
        'change_role' => [self::OWNER],
        'transfer' => [self::OWNER],
        'sso' => [self::OWNER],
    ];

    public static function can(?string $role, string $action): bool
    {
        return $role !== null && in_array($role, self::CAN[$action] ?? [], true);
    }

    /** May `$actor` act on someone holding `$target`? Owners reach everyone, admins reach members, nobody reaches their peers. */
    public static function outranks(string $actor, string $target): bool
    {
        return $actor === self::OWNER || (self::RANK[$actor] ?? 0) > (self::RANK[$target] ?? 99);
    }

    /** The actions a role holds, for the client to show or hide controls (the server still checks every request). */
    public static function allowed(string $role): array
    {
        return array_values(array_filter(array_keys(self::CAN), fn ($a) => self::can($role, $a)));
    }
}
