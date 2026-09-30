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
        if (!$response->successful() || !is_array($response->json())) {
            throw new RuntimeException('Google refused this request. Check the connection and its access.');
        }
        return $response->json();
    }
}
