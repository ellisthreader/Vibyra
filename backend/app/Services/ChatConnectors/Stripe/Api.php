<?php

namespace App\Services\ChatConnectors\Stripe;

use App\Services\ChatConnectors\ReconnectRequired;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

/**
 * The connector's own calls to api.stripe.com. A refusal returns null, and `failed` words it truthfully from what Stripe
 * said: a connection Stripe no longer honours is a reconnect, a key without permission is not "unreachable".
 */
final class Api
{
    private const BASE = 'https://api.stripe.com/v1';

    private ?int $status = null;

    /** The decoded body, or null when Stripe refused or could not be reached. */
    public function get(string $credential, string $path, array $query = []): ?array
    {
        return $this->answer($credential, $this->request($credential)->get(self::BASE.$path, $query));
    }

    /** The created resource, or null when Stripe refused. Stripe takes form bodies, not JSON. */
    public function post(string $credential, string $path, array $payload): ?array
    {
        return $this->answer($credential, $this->request($credential)->asForm()->post(self::BASE.$path, $payload));
    }

    /** The tool result for a call that returned null. */
    public function failed(): array
    {
        $error = match ($this->status) {
            403 => 'This Stripe connection is not allowed to read that. A restricted key needs read access to it.',
            429 => 'Stripe is rate-limiting requests. Please try again in a moment.',
            default => 'Stripe could not be reached just now. Please try again in a moment.',
        };
        return ['result' => ['error' => $error], 'summary' => $this->status === 403 ? 'Stripe refused the request' : 'Could not reach Stripe'];
    }

    private function request(string $credential): PendingRequest
    {
        return Auth::apply(Http::acceptJson()->timeout((int) config('chat_connectors.timeout_seconds', 12)), $credential);
    }

    private function answer(string $credential, Response $response): ?array
    {
        $this->status = $response->status();
        if ($response->successful()) return is_array($body = $response->json()) ? $body : null;
        // A dead sign-in names the fix. A rejected platform key is ours to fix: reconnecting would not help.
        $revoked = $this->status === 401 || $response->json('error.code') === 'account_invalid';
        if ($revoked && Auth::account($credential) === null) throw ReconnectRequired::for('stripe');
        if ($this->status === 401) abort(503, 'Stripe refused the key Vibyra uses for Stripe sign-ins. This is a server setup problem; reconnecting will not fix it.');
        if ($revoked) throw ReconnectRequired::for('stripe');
        return null;
    }
}
