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
            $r = Http::withToken($token)->acceptJson()->timeout($remaining)->withOptions(['allow_redirects' => false])
                ->get('https://api.stripe.com/v1'.$path, $query);
            if (!$r->successful()) return ['error' => match ($r->status()) {
                401 => 'Stripe access expired or was revoked. Reconnect Stripe.',
                403 => 'This Stripe connection does not have access to the requested data.',
                429 => 'Stripe is rate-limiting requests. Try again shortly.',
                default => 'Stripe could not return this data. Try again later.',
            }, 'status' => $r->status()];
            $data = $r->json();
            return is_array($data) ? ['data' => $data] : ['error' => 'Stripe returned an unreadable response.'];
        } catch (\Throwable) { return ['error' => 'Stripe did not respond in time. Try again later.']; }
    }
}
