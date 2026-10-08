<?php

namespace App\Services\ChatConnectors\Stripe;

use Illuminate\Support\Facades\Http;

final class Client
{
    public function get(string $token, string $path, array $query = []): array
    {
        $remaining = \App\Services\ChatConnectors\Github\Client::remaining();
        if ($remaining < 0.2) return ['error' => 'Read time budget reached. Continue this report in another message.'];
        try {
            $r = Auth::apply(Http::acceptJson(), $token)->timeout($remaining)->withOptions(['allow_redirects' => false])
                ->get('https://api.stripe.com/v1'.$path, $query);
            // Stripe says `account_invalid` when the person revoked Vibyra from their own Dashboard.
            if (!$r->successful()) return ['error' => match (true) {
                $r->status() === 401 && Auth::account($token) !== null => 'Stripe refused the key Vibyra uses for Stripe sign-ins. That is a setup problem on Vibyra\'s side; reconnecting will not fix it.',
                $r->status() === 401, $r->json('error.code') === 'account_invalid' => 'Stripe access expired or was revoked. Reconnect Stripe.',
                $r->status() === 403 => 'This Stripe connection does not have access to the requested data.',
                $r->status() === 429 => 'Stripe is rate-limiting requests. Try again shortly.',
                default => 'Stripe could not return this data. Try again later.',
            }, 'status' => $r->status()];
            $data = $r->json();
            return is_array($data) ? ['data' => $data] : ['error' => 'Stripe returned an unreadable response.'];
        } catch (\Throwable) { return ['error' => 'Stripe did not respond in time. Try again later.']; }
    }
}
