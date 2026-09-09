<?php

namespace App\Services\Vibes;

class Plans
{
    /** Enforced defaults for an unknown or missing plan. Never widen here. */
    private const FLOOR = ['maxProjects' => 1, 'concurrentReplies' => 1, 'fullCatalogue' => false, 'remoteAccess' => false];

    public function for(string $plan): array
    {
        $configured = config('vibes.plans')[$plan] ?? config('vibes.plans')['free'] ?? [];

        return [
            'maxProjects' => array_key_exists('maxProjects', $configured) ? $configured['maxProjects'] : self::FLOOR['maxProjects'],
            'concurrentReplies' => max(1, (int) ($configured['concurrentReplies'] ?? self::FLOOR['concurrentReplies'])),
            'fullCatalogue' => (bool) ($configured['fullCatalogue'] ?? self::FLOOR['fullCatalogue']),
            'remoteAccess' => (bool) ($configured['remoteAccess'] ?? self::FLOOR['remoteAccess']),
        ];
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
