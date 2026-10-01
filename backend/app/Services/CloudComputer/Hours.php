<?php
namespace App\Services\CloudComputer;

use App\Services\CloudWorkspaces\Allowance;

/**
 * Included monthly hours as the phone sees them. Uses the billing worker's
 * App\Services\CloudWorkspaces\Allowance (remainingSeconds, summary, consume);
 * without it nothing is included and every second is charged in tokens.
 */
class Hours
{
    public function summary(int $user): array
    {
        $none = ['allowanceSeconds' => 0, 'usedSeconds' => 0, 'resetsAt' => null, 'overage' => 'tokens'];
        if (!class_exists(Allowance::class)) return $none;
        $s = app(Allowance::class)->summary($user);
        return ['allowanceSeconds' => (int) ($s['allowanceSeconds'] ?? 0), 'usedSeconds' => (int) ($s['usedSeconds'] ?? 0),
            'resetsAt' => $s['resetsAt'] ?? null, 'overage' => ($s['overage'] ?? 'tokens') === 'blocked' ? 'blocked' : 'tokens'];
    }

    public function remainingSeconds(int $user): int
    {
        return class_exists(Allowance::class) ? app(Allowance::class)->remainingSeconds($user) : 0;
    }
}
