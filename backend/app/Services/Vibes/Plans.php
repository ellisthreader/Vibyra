<?php

namespace App\Services\Vibes;

class Plans
{
    /** Enforced defaults for an unknown or missing plan. Never widen here. */
    private const FLOOR = ['maxProjects' => 1, 'concurrentReplies' => 1, 'fullCatalogue' => false, 'remoteAccess' => false,
        'sessionCredits' => 60, 'weekCredits' => 150, 'maxTerminals' => 2, 'safeWorktrees' => false, 'agents' => false,
        'preview' => false, 'review' => false];

    public function for(string $plan): array
    {
        $configured = config('vibes.plans')[$plan] ?? config('vibes.plans')['free'] ?? [];

        return [
            'maxProjects' => array_key_exists('maxProjects', $configured) ? $configured['maxProjects'] : self::FLOOR['maxProjects'],
            'concurrentReplies' => max(1, (int) ($configured['concurrentReplies'] ?? self::FLOOR['concurrentReplies'])),
            'fundedTerminals' => (bool) config('vibes.funded_terminals_enabled') && in_array($plan, ['pro', 'pro_v2'], true),
            'fullCatalogue' => (bool) ($configured['fullCatalogue'] ?? self::FLOOR['fullCatalogue']),
            'remoteAccess' => (bool) ($configured['remoteAccess'] ?? self::FLOOR['remoteAccess']),
            // The two rolling usage windows. `UsageWindows` is the only thing that
            // enforces them, and it reads them from here, so a plan that omits one
            // is rate-limited at the floor rather than left unlimited.
            'sessionCredits' => $this->window($configured, 'sessionCredits'),
            'weekCredits' => $this->window($configured, 'weekCredits'),
            // Workspace limits. Until the switch is on they are unlimited for everyone.
            'maxTerminals' => $this->limitsOn() ? $this->terminals($configured) : null,
            'safeWorktrees' => !$this->limitsOn() || (bool) ($configured['safeWorktrees'] ?? self::FLOOR['safeWorktrees']),
            'agents' => !$this->limitsOn() || (bool) ($configured['agents'] ?? self::FLOOR['agents']),
            'preview' => !$this->limitsOn() || (bool) ($configured['preview'] ?? self::FLOOR['preview']),
            'review' => !$this->limitsOn() || (bool) ($configured['review'] ?? self::FLOOR['review']),
        ];
    }

    public function limitsOn(): bool
    {
        return (bool) config('vibes.plan_limits_enabled');
    }

    /** Null is unlimited; anything else is at least one terminal. */
    private function terminals(array $configured): ?int
    {
        if (!array_key_exists('maxTerminals', $configured)) return self::FLOOR['maxTerminals'];
        return $configured['maxTerminals'] === null ? null : max(1, (int) $configured['maxTerminals']);
    }

    /**
     * One window allowance. Zero is not "no limit" here - it would be a plan that
     * can never send - so an absent, negative or zero value lands on the floor.
     */
    private function window(array $configured, string $key): int
    {
        $value = (int) ($configured[$key] ?? 0);

        return $value > 0 ? $value : self::FLOOR[$key];
    }

    /**
     * Every plan's entitlements, so the phone can compare offers without
     * hardcoding numbers that only this config is allowed to change.
     */
    public function all(): array
    {
        return collect(config('vibes.plans'))->except('pro_v2')->keys()
            ->mapWithKeys(fn (string $plan) => [$plan => $this->for($plan)])->all();
    }

    /** Remote access is sold as included, but is only usable once a qualified relay ships. */
    public function remoteAccessLive(): bool
    {
        return (bool) config('vibes.remote_access_live');
    }
}
