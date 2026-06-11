<?php

namespace App\Services\AI;

use InvalidArgumentException;

class TeamPlanTopology
{
    public function normalize(mixed $roles): array
    {
        if (! is_array($roles) || ! array_is_list($roles)) {
            throw new InvalidArgumentException('roles must be a list.');
        }

        $normalized = array_map(fn ($role) => strtolower(trim((string) $role)), $roles);
        if (
            count($normalized) < 2
            || count($normalized) > 4
            || count(array_unique($normalized)) !== count($normalized)
        ) {
            throw new InvalidArgumentException('roles must contain two to four unique supported roles.');
        }
        foreach ($normalized as $role) {
            if (! in_array($role, TeamPlanSchema::ROLES, true)) {
                throw new InvalidArgumentException('roles contains an unsupported role.');
            }
        }
        if (! in_array('builder', $normalized, true) || ! in_array('reviewer', $normalized, true)) {
            throw new InvalidArgumentException('roles must include exactly one Builder and one Reviewer.');
        }
        if (! $this->isSupported($normalized)) {
            throw new InvalidArgumentException('roles does not match a supported Team topology.');
        }

        return $normalized;
    }

    private function isSupported(array $roles): bool
    {
        return match (count($roles)) {
            2 => $this->sameSet($roles, ['builder', 'reviewer']),
            3 => $this->sameSet($roles, ['coordinator', 'builder', 'reviewer'])
                || $this->sameSet($roles, ['builder', 'verifier', 'reviewer']),
            4 => $this->sameSet($roles, TeamPlanSchema::ROLES),
            default => false,
        };
    }

    private function sameSet(array $left, array $right): bool
    {
        sort($left);
        sort($right);

        return $left === $right;
    }
}
