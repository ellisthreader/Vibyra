<?php

namespace App\Services\Auth;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class DesktopProviderOAuthFlow
{
    use ProviderEnrollmentOAuthFlow;

    private const FLOW_MINUTES = 10;

    public function isConfigured(string $provider): bool
    {
        try {
            $this->settings($provider);
            return true;
        } catch (ProviderIdentityException) {
            return false;
        }
    }

    /**
     * A finished sign-in is only released to whoever started it: the website
     * passes its session as the binding, and apps may pass a flowSecret they
     * hold. Every flow also records the starting network, so the callback asks
     * the person to confirm when the link was opened somewhere else.
     */
    public function start(string $provider, array $client, ?string $binding = null, ?string $startIp = null, ?string $licenseHash = null): array
    {
        $secret = trim((string) ($client['flowSecret'] ?? ''));
        if ($binding === null && (strlen($secret) < 32 || strlen($secret) > 256)) {
            throw new ProviderIdentityException('Update Vibyra to continue with secure provider sign-in (flowSecret required).');
        }

        return $this->create($provider, [
            'deviceName' => mb_substr(trim((string) ($client['deviceName'] ?? 'Vibyra Desktop')), 0, 120),
            'installId' => mb_substr(trim((string) ($client['installId'] ?? '')), 0, 128),
            'publicIp' => trim((string) ($client['publicIp'] ?? '')),
            'binding' => $binding !== null ? hash('sha256', $binding) : null,
            'secretHash' => $secret !== '' ? hash('sha256', $secret) : null,
            'startIp' => $startIp,
            'supportsTwoFactor' => ($client['supportsTwoFactor'] ?? false) === true,
            'licenseHash' => $licenseHash,
        ]);
    }

    /** Reads a flow by its state without consuming it, for the confirmation step. */
    public function peekState(string $provider, string $state): ?array
    {
        $flowId = $state === '' ? null : Cache::get($this->stateKey($state));
        $flow = is_string($flowId) ? Cache::get($this->flowKey($flowId)) : null;

        return is_array($flow) && ($flow['provider'] ?? null) === $provider
            && hash_equals((string) ($flow['state'] ?? ''), $state) ? $flow : null;
    }

    public function needsConfirmation(array $flow, ?string $callbackIp): bool
    {
        // Binding and secrets prove who *started* a flow, and an attacker can start
        // one and send the link on. Only returning on the starting network proves
        // the person finishing it is the one who started it.
        if ($flow['purpose'] ?? null) {
            return false;
        }
        $startIp = (string) ($flow['startIp'] ?? '');

        return $startIp === '' || $callbackIp === null || ! hash_equals($startIp, $callbackIp);
    }

    public function startDeletion(string $provider, int $accountId, string $providerSubject): array
    {
        if ($accountId < 1 || trim($providerSubject) === '') {
            throw new ProviderIdentityException('The account cannot be verified for deletion.');
        }

        return $this->create($provider, [
            'purpose' => 'deletion',
            'accountId' => $accountId,
            'providerSubject' => $providerSubject,
        ]);
    }

    public function consumeState(string $provider, string $state): array
    {
        return Cache::lock('provider-state-claim:'.hash('sha256', $state), 15)->block(5, fn () => $this->consumeStateLocked($provider, $state));
    }

    private function consumeStateLocked(string $provider, string $state): array
    {
        $flowId = $state === '' ? null : Cache::pull($this->stateKey($state));
        $flow = is_string($flowId) ? Cache::get($this->flowKey($flowId)) : null;
        if (! is_array($flow)
            || ($flow['provider'] ?? null) !== $provider
            || ! hash_equals((string) ($flow['state'] ?? ''), $state)) {
            throw new ProviderIdentityException('The desktop sign-in flow is invalid or expired.');
        }

        return ['flowId' => $flowId, ...$flow];
    }

    public function finish(string $flowId, array $result): void
    {
        $flow = Cache::get($this->flowKey($flowId));
        Cache::forget($this->flowKey($flowId));
        Cache::put($this->resultKey($flowId), [
            'provider' => is_array($flow) ? ($flow['provider'] ?? null) : null,
            'purpose' => is_array($flow) ? ($flow['purpose'] ?? null) : null,
            'binding' => is_array($flow) ? ($flow['binding'] ?? null) : null,
            'secretHash' => is_array($flow) ? ($flow['secretHash'] ?? null) : null,
            'enrollment' => is_array($flow) && ($flow['purpose'] ?? null) === 'two_factor_enrollment'
                ? $this->enrollmentBinding($flow) : null,
            'result' => $result,
        ], now()->addMinutes(5));
    }

    public function status(string $provider, string $flowId, ?string $binding = null, ?string $secret = null): array
    {
        if ($this->isEnrollment($flowId)) {
            return ['ok' => false, 'status' => 'forbidden', 'error' => 'Account verification requires its original session.'];
        }

        return $this->statusResult($provider, $flowId, $binding, $secret);
    }

    private function statusResult(string $provider, string $flowId, ?string $binding = null, ?string $secret = null): array
    {
        return Cache::lock('provider-result-claim:'.hash('sha256', $flowId), 15)->block(5,
            fn () => $this->statusResultLocked($provider, $flowId, $binding, $secret));
    }

    private function statusResultLocked(string $provider, string $flowId, ?string $binding, ?string $secret): array
    {
        $completed = Cache::get($this->resultKey($flowId));
        if (is_array($completed) && ($completed['provider'] ?? null) === $provider) {
            if (! $this->ownsFlow($completed, $binding, $secret)) {
                return ['ok' => false, 'status' => 'forbidden', 'error' => 'This sign-in belongs to another session.'];
            }
            $claimed = Cache::pull($this->resultKey($flowId));
            if (is_array($claimed) && ($claimed['provider'] ?? null) === $provider) {
                return (array) ($claimed['result'] ?? []);
            }

            return ['ok' => false, 'status' => 'expired', 'error' => 'This sign-in attempt expired. Try again.'];
        }

        $flow = Cache::get($this->flowKey($flowId));
        if (is_array($flow) && ($flow['provider'] ?? null) === $provider) {
            return ['ok' => true, 'status' => 'pending'];
        }

        return ['ok' => false, 'status' => 'expired', 'error' => 'This sign-in attempt expired. Try again.'];
    }

    private function ownsFlow(array $flow, ?string $binding, ?string $secret): bool
    {
        $expectedBinding = $flow['binding'] ?? null;
        if (is_string($expectedBinding)
            && ($binding === null || ! hash_equals($expectedBinding, hash('sha256', $binding)))) {
            return false;
        }
        $expectedSecret = $flow['secretHash'] ?? null;

        if (is_string($expectedSecret)) {
            return $secret !== null && $secret !== '' && hash_equals($expectedSecret, hash('sha256', $secret));
        }

        // Enrollment claims were already checked against the original user and session.
        return is_string($expectedBinding) || is_array($flow['enrollment'] ?? null)
            || ($flow['purpose'] ?? null) === 'deletion';
    }

    private function create(string $provider, array $details): array
    {
        $settings = $this->settings($provider);
        $flowId = Str::random(64);
        $state = Str::random(64);
        $flow = [
            'provider' => $provider,
            'state' => $state,
            'nonce' => Str::random(64),
            'verifier' => Str::random(96),
            ...$details,
        ];

        Cache::put($this->flowKey($flowId), $flow, now()->addMinutes(self::FLOW_MINUTES));
        Cache::put($this->stateKey($state), $flowId, now()->addMinutes(self::FLOW_MINUTES));

        return [
            'flowId' => $flowId,
            'authUrl' => $this->authorizationUrl($provider, $settings, $flow),
            'expiresIn' => self::FLOW_MINUTES * 60,
        ];
    }

    private function authorizationUrl(string $provider, array $settings, array $flow): string
    {
        $query = [
            'client_id' => $settings['client_id'],
            'redirect_uri' => $settings['redirect_uri'],
            'response_type' => 'code',
            'scope' => $provider === 'apple' ? 'name email' : 'openid email profile',
            'state' => $flow['state'],
            'nonce' => $flow['nonce'],
        ];
        if ($provider !== 'apple') {
            $query['code_challenge'] = $this->base64Url(hash('sha256', $flow['verifier'], true));
            $query['code_challenge_method'] = 'S256';
            $query['prompt'] = 'select_account';
        } else {
            $query['response_mode'] = 'form_post';
        }

        return $settings['authorize_url'].'?'.http_build_query($query, '', '&', PHP_QUERY_RFC3986);
    }

    private function settings(string $provider): array
    {
        if (! in_array($provider, ['apple', 'google', 'microsoft'], true)) {
            throw new ProviderIdentityException('Unsupported desktop sign-in provider.');
        }

        $settings = (array) config("services.{$provider}_desktop_oauth", []);
        $hasSecret = trim((string) ($settings['client_secret'] ?? '')) !== '';
        $hasAppleKey = trim((string) ($settings['team_id'] ?? '')) !== ''
            && trim((string) ($settings['key_id'] ?? '')) !== ''
            && trim((string) ($settings['private_key'] ?? '')) !== '';
        if (trim((string) ($settings['client_id'] ?? '')) === ''
            || trim((string) ($settings['redirect_uri'] ?? '')) === ''
            || ($provider === 'apple' ? ! $hasSecret && ! $hasAppleKey : ! $hasSecret)) {
            // Phones use this browser flow too, so the message must not say "desktop".
            throw new ProviderIdentityException(ucfirst($provider).' sign-in isn’t set up on this Vibyra server.');
        }

        return $settings;
    }

    private function flowKey(string $id): string
    {
        return 'desktop-provider-flow:'.hash('sha256', $id);
    }

    private function stateKey(string $state): string
    {
        return 'desktop-provider-state:'.hash('sha256', $state);
    }

    private function resultKey(string $id): string
    {
        return 'desktop-provider-result:'.hash('sha256', $id);
    }

    private function base64Url(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
