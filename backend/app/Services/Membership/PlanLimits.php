<?php

namespace App\Services\Membership;

use App\Models\User;
use App\Services\Vibes\Plans;

/**
 * The workspace limits a client enforces or shows, in one versioned block. The
 * desktop enforces maxTerminals, maxProjects, safeWorktrees, preview and review;
 * the server enforces agents and remote access itself. `enforced` false means
 * every limit reads as unlimited.
 */
final class PlanLimits
{
    public function for(User $user): array
    {
        $m = app(Entitlements::class)->for($user);
        $e = app(Plans::class)->for($m['plan']);
        return ['version' => 1, 'enforced' => app(Plans::class)->limitsOn(),
            'plan' => $m['plan'], 'tier' => $m['tier'], 'trial' => (bool) ($m['trial'] ?? false),
            'paidUntil' => $m['paidUntil'] ? \Illuminate\Support\Carbon::parse($m['paidUntil'])->toIso8601String() : null,
            'maxTerminals' => $e['maxTerminals'], 'maxProjects' => app(Plans::class)->limitsOn() ? $e['maxProjects'] : null,
            'safeWorktrees' => $e['safeWorktrees'], 'preview' => $e['preview'], 'review' => $e['review'],
            'agents' => $e['agents'], 'remoteAccess' => $e['remoteAccess']];
    }

    public function allows(User $user, string $feature): bool
    {
        return (bool) app(Plans::class)->for(app(Entitlements::class)->for($user)['plan'])[$feature];
    }
}
