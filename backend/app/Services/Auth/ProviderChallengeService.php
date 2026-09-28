<?php

namespace App\Services\Auth;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class ProviderChallengeService
{
    public function issue(string $provider): array
    {
        if ($provider !== 'apple') {
            throw new ProviderIdentityException('Unsupported challenge provider.');
        }

        $id = (string) Str::uuid();
        $nonce = Str::random(64);
        Cache::put($this->key($id), ['provider' => $provider, 'nonce' => $nonce], now()->addMinutes(10));

        return ['challengeId' => $id, 'nonce' => $nonce];
    }

    public function consume(string $provider, string $id): string
    {
        $challenge = $id === '' ? null : Cache::pull($this->key($id));
        if (! is_array($challenge)
            || ($challenge['provider'] ?? null) !== $provider
            || ! is_string($challenge['nonce'] ?? null)) {
            throw new ProviderIdentityException('The sign-in challenge is invalid or expired.');
        }

        return $challenge['nonce'];
    }

    private function key(string $id): string
    {
        return 'auth-provider-challenge:'.hash('sha256', $id);
    }
}
