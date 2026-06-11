<?php

namespace App\Services\Auth;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class DesktopProviderOAuthFlow
{
    private const FLOW_MINUTES = 10;

    public function start(string $provider, array $client): array
    {
        $settings = $this->settings($provider);
        $flowId = Str::random(64);
        $state = Str::random(64);
        $nonce = Str::random(64);
        $verifier = Str::random(96);
        $flow = [
            'provider' => $provider,
            'state' => $state,
            'nonce' => $nonce,
            'verifier' => $verifier,
            'deviceName' => mb_substr(trim((string) ($client['deviceName'] ?? 'Vibyra Desktop')), 0, 120),
            'installId' => mb_substr(trim((string) ($client['installId'] ?? '')), 0, 128),
            'publicIp' => trim((string) ($client['publicIp'] ?? '')),
        ];

        Cache::put($this->flowKey($flowId), $flow, now()->addMinutes(self::FLOW_MINUTES));
        Cache::put($this->stateKey($state), $flowId, now()->addMinutes(self::FLOW_MINUTES));

        return [
            'flowId' => $flowId,
            'authUrl' => $this->authorizationUrl($provider, $settings, $flow),
            'expiresIn' => self::FLOW_MINUTES * 60,
        ];
    }

    public function consumeState(string $provider, string $state): array
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
        Cache::forget($this->flowKey($flowId));
        Cache::put($this->resultKey($flowId), $result, now()->addMinutes(5));
    }

    public function status(string $provider, string $flowId): array
    {
        $result = Cache::pull($this->resultKey($flowId));
        if (is_array($result)) {
            return $result;
        }

        $flow = Cache::get($this->flowKey($flowId));
        if (is_array($flow) && ($flow['provider'] ?? null) === $provider) {
            return ['ok' => true, 'status' => 'pending'];
        }

        return ['ok' => false, 'status' => 'expired', 'error' => 'This sign-in attempt expired. Try again.'];
    }

    private function authorizationUrl(string $provider, array $settings, array $flow): string
    {
        $query = [
            'client_id' => $settings['client_id'],
            'redirect_uri' => $settings['redirect_uri'],
            'response_type' => 'code',
            'scope' => $provider === 'google' ? 'openid email profile' : 'name email',
            'state' => $flow['state'],
            'nonce' => $flow['nonce'],
        ];
        if ($provider === 'google') {
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
        if (! in_array($provider, ['apple', 'google'], true)) {
            throw new ProviderIdentityException('Unsupported desktop sign-in provider.');
        }

        $settings = (array) config("services.{$provider}_desktop_oauth", []);
        if (trim((string) ($settings['client_id'] ?? '')) === ''
            || trim((string) ($settings['redirect_uri'] ?? '')) === '') {
            throw new ProviderIdentityException(ucfirst($provider).' desktop sign-in is not configured.');
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
