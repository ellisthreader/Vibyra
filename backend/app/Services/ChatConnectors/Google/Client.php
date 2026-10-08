<?php

namespace App\Services\ChatConnectors\Google;

use Illuminate\Support\Facades\Http;
use RuntimeException;

final class Client
{
    public function get(string $token, string $url, array $query = []): array
    {
        $request = Http::withToken($token)->acceptJson()
            ->timeout((int) config('chat_connectors.timeout_seconds', 12));
        return $this->body($query === [] ? $request->get($url) : $request->get($url, $query));
    }

    public function post(string $token, string $url, array $payload): array
    {
        return $this->body(Http::withToken($token)->acceptJson()
            ->timeout((int) config('chat_connectors.timeout_seconds', 12))->post($url, $payload));
    }

    public function account(string $token): string
    {
        $user = $this->get($token, 'https://www.googleapis.com/oauth2/v3/userinfo');
        $email = $user['email'] ?? null;
        if (!is_string($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new RuntimeException('Google did not return an account email. Reconnect and allow email access.');
        }
        return $email;
    }

    private function body($response): array
    {
        if ($response->status() === 401) throw new \App\Services\ChatConnectors\ReconnectRequired('Google access expired or was revoked. Tell the person to reconnect it in Settings → Integrations.');
        // Google says why in `reasons`; the ones the person or the owner can act on are worded as such, not as an outage.
        $reasons = array_merge(array_column((array) $response->json('error.errors'), 'reason'), array_column((array) $response->json('error.details'), 'reason'));
        match (true) {
            (bool) array_intersect($reasons, ['accessNotConfigured', 'SERVICE_DISABLED']) => abort(503, 'Google says this API is not switched on for Vibyra\'s Google project. That is a setup problem on Vibyra\'s side; reconnecting will not fix it.'),
            (bool) array_intersect($reasons, ['insufficientPermissions', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT']) => abort(403, 'Google says this sign-in was not granted the access this needs. Reconnect Google and allow every permission it asks for.'),
            $response->status() === 429, (bool) array_intersect($reasons, ['rateLimitExceeded', 'userRateLimitExceeded']) => abort(429, 'Google is rate-limiting requests. Try again shortly.'),
            $response->status() === 404 => abort(404, 'Google could not find that item, or this account cannot see it.'),
            default => null,
        };
        if (!$response->successful() || !is_array($response->json())) {
            throw new RuntimeException('Google refused this request. Check the connection and its access.');
        }
        return $response->json();
    }
}
