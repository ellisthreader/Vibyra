<?php

namespace App\Services\Auth;

use App\Models\SecurityRoleAssignment;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class PrivilegedRoleService
{
    public const MODE_BOOTSTRAP = 'bootstrap';

    public const MODE_DATABASE = 'database';

    public const MODE_LEGACY = 'legacy';

    public function canReviewPublishedProjects(User $user): bool
    {
        if ($this->hasAnyActiveRole($user, [
            SecurityRoleAssignment::ROLE_REVIEWER,
            SecurityRoleAssignment::ROLE_ADMIN,
        ])) {
            return true;
        }

        return match ($this->mode()) {
            self::MODE_LEGACY => $this->isVerifiedAllowlistedUser($user),
            self::MODE_BOOTSTRAP => $this->bootstrapReviewerAssignment($user),
            default => false,
        };
    }

    public function hasRole(User $user, string $role): bool
    {
        $this->assertRole($role);

        return $this->hasAnyActiveRole($user, [$role]);
    }

    public function grant(
        User $user,
        string $role,
        ?User $grantedBy = null,
        string $source = 'manual',
    ): SecurityRoleAssignment {
        $this->assertRole($role);

        return SecurityRoleAssignment::query()->updateOrCreate(
            ['user_id' => $user->id, 'role' => $role],
            [
                'grant_source' => $source,
                'granted_by_user_id' => $grantedBy?->id,
                'granted_at' => now(),
                'revoked_by_user_id' => null,
                'revoked_at' => null,
                'revocation_reason' => null,
            ],
        );
    }

    public function revoke(
        User $user,
        string $role,
        ?User $revokedBy = null,
        string $reason = 'revoked',
    ): bool {
        $this->assertRole($role);

        return SecurityRoleAssignment::query()
            ->where('user_id', $user->id)
            ->where('role', $role)
            ->whereNull('revoked_at')
            ->update([
                'revoked_by_user_id' => $revokedBy?->id,
                'revoked_at' => now(),
                'revocation_reason' => mb_substr(trim($reason), 0, 160),
                'updated_at' => now(),
            ]) > 0;
    }

    private function bootstrapReviewerAssignment(User $user): bool
    {
        if (! $this->isVerifiedAllowlistedUser($user)) {
            return false;
        }

        $bootstrapKey = hash_hmac(
            'sha256',
            strtolower(trim((string) $user->email)),
            (string) config('app.key'),
        );

        return DB::transaction(function () use ($user, $bootstrapKey): bool {
            $consumed = SecurityRoleAssignment::query()
                ->where('bootstrap_key', $bootstrapKey)
                ->lockForUpdate()
                ->first();

            if ($consumed !== null) {
                return $consumed->user_id === $user->id && $consumed->revoked_at === null;
            }

            $existing = SecurityRoleAssignment::query()
                ->where('user_id', $user->id)
                ->where('role', SecurityRoleAssignment::ROLE_REVIEWER)
                ->lockForUpdate()
                ->first();
            if ($existing !== null) {
                $existing->forceFill(['bootstrap_key' => $bootstrapKey])->save();

                return $existing->revoked_at === null;
            }

            $timestamp = now();
            SecurityRoleAssignment::query()->insertOrIgnore([
                'user_id' => $user->id,
                'role' => SecurityRoleAssignment::ROLE_REVIEWER,
                'grant_source' => 'email_bootstrap',
                'bootstrap_key' => $bootstrapKey,
                'granted_by_user_id' => null,
                'granted_at' => $timestamp,
                'revoked_by_user_id' => null,
                'revoked_at' => null,
                'revocation_reason' => null,
                'created_at' => $timestamp,
                'updated_at' => $timestamp,
            ]);

            $assignment = SecurityRoleAssignment::query()
                ->where('bootstrap_key', $bootstrapKey)
                ->first();

            return $assignment !== null
                && $assignment->user_id === $user->id
                && $assignment->revoked_at === null;
        });
    }

    /**
     * @param  array<int, string>  $roles
     */
    private function hasAnyActiveRole(User $user, array $roles): bool
    {
        return SecurityRoleAssignment::query()
            ->where('user_id', $user->id)
            ->whereIn('role', $roles)
            ->whereNull('revoked_at')
            ->exists();
    }

    private function isVerifiedAllowlistedUser(User $user): bool
    {
        if (! $user->hasVerifiedEmail()) {
            return false;
        }

        $email = strtolower(trim((string) $user->email));
        $emails = array_map(
            static fn (mixed $value): string => strtolower(trim((string) $value)),
            (array) config('moderation.publish_reviewer_emails', []),
        );

        return $email !== '' && in_array($email, $emails, true);
    }

    private function mode(): string
    {
        $mode = strtolower((string) config('moderation.privileged_role_mode', self::MODE_DATABASE));

        return in_array($mode, [self::MODE_LEGACY, self::MODE_BOOTSTRAP, self::MODE_DATABASE], true)
            ? $mode
            : self::MODE_DATABASE;
    }

    private function assertRole(string $role): void
    {
        if (! in_array($role, [
            SecurityRoleAssignment::ROLE_REVIEWER,
            SecurityRoleAssignment::ROLE_ADMIN,
        ], true)) {
            throw new InvalidArgumentException("Unsupported privileged role [{$role}].");
        }
    }
}
