<?php

namespace App\Services\Vibes;

class Plans
{
    /** Enforced defaults for an unknown or missing plan. Never widen here. */
    private const FLOOR = ['maxProjects' => 1, 'concurrentReplies' => 1, 'fullCatalogue' => false, 'remoteAccess' => false,
        'sessionCredits' => 60, 'weekCredits' => 150];

    public function for(string $plan): array
    {
        $configured = config('vibes.plans')[$plan] ?? config('vibes.plans')['free'] ?? [];

        return [
            'maxProjects' => array_key_exists('maxProjects', $configured) ? $configured['maxProjects'] : self::FLOOR['maxProjects'],
            'concurrentReplies' => max(1, (int) ($configured['concurrentReplies'] ?? self::FLOOR['concurrentReplies'])),
            'fullCatalogue' => (bool) ($configured['fullCatalogue'] ?? self::FLOOR['fullCatalogue']),
            'remoteAccess' => (bool) ($configured['remoteAccess'] ?? self::FLOOR['remoteAccess']),
            // The two rolling usage windows. `UsageWindows` is the only thing that
            // enforces them, and it reads them from here, so a plan that omits one
            // is rate-limited at the floor rather than left unlimited.
            'sessionCredits' => $this->window($configured, 'sessionCredits'),
            'weekCredits' => $this->window($configured, 'weekCredits'),
        ];
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
        return collect(config('vibes.plans'))->keys()
            ->mapWithKeys(fn (string $plan) => [$plan => $this->for($plan)])->all();
    }

    /** Remote access is sold as included, but is only usable once a qualified relay ships. */
    public function remoteAccessLive(): bool
    {
        return (bool) config('vibes.remote_access_live');
    }
}
