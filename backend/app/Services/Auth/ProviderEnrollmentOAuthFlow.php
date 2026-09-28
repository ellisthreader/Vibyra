<?php

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Support\Facades\Cache;

trait ProviderEnrollmentOAuthFlow
{
    public function startEnrollment(
        string $provider, int $accountId, string $providerSubject,
        string $sessionType, string $sessionId,
    ): array {
        if ($accountId < 1 || trim($providerSubject) === ''
            || $sessionType !== 'web' || trim($sessionId) === '') {
            throw new ProviderIdentityException('The account cannot be verified for enrollment.');
        }

        return $this->create($provider, [
            'purpose' => 'two_factor_enrollment',
            'accountId' => $accountId,
            'providerSubject' => $providerSubject,
            'sessionType' => $sessionType,
            'sessionId' => $sessionId,
        ]);
    }

    public function statusForEnrollment(
        string $provider, string $flowId, User $user, string $sessionType, string $sessionId,
    ): array {
        $completed = Cache::get($this->resultKey($flowId));
        $flow = Cache::get($this->flowKey($flowId));
        $binding = is_array($completed) ? ($completed['enrollment'] ?? null)
            : (is_array($flow) ? $this->enrollmentBinding($flow) : null);
        if (! is_array($binding)
            || ($provider !== ($binding['provider'] ?? null))
            || (int) $user->id !== (int) ($binding['accountId'] ?? 0)
            || ($user->provider ?: 'email') !== $provider
            || ! hash_equals((string) $user->provider_id, (string) ($binding['providerSubject'] ?? ''))
            || $sessionType !== ($binding['sessionType'] ?? null)
            || ! hash_equals($sessionId, (string) ($binding['sessionId'] ?? ''))) {
            throw new ProviderIdentityException('This provider verification does not belong to this session.');
        }

        return $this->statusResult($provider, $flowId);
    }

    public function isEnrollment(string $flowId): bool
    {
        $completed = Cache::get($this->resultKey($flowId));
        $flow = Cache::get($this->flowKey($flowId));

        return (is_array($completed) && is_array($completed['enrollment'] ?? null))
            || (is_array($flow) && ($flow['purpose'] ?? null) === 'two_factor_enrollment');
    }

    private function enrollmentBinding(array $flow): ?array
    {
        if (($flow['purpose'] ?? null) !== 'two_factor_enrollment') {
            return null;
        }

        return array_intersect_key($flow, array_flip([
            'provider', 'accountId', 'providerSubject', 'sessionType', 'sessionId',
        ]));
    }
}
