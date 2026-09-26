<?php

namespace App\Services\ChatConnectors\Microsoft;

use Illuminate\Support\Facades\Http;
use RuntimeException;

final class Client
{
    private const BASE = 'https://graph.microsoft.com/v1.0';

    public function get(string $token, string $path, array $query = []): array
    {
        $response = Http::withToken($token)->acceptJson()
            ->timeout((int) config('chat_connectors.timeout_seconds', 12))
            ->get(self::BASE.$path, $query);
        return $this->body($response);
    }

    public function post(string $token, string $path, array $payload): array
    {
        $response = Http::withToken($token)->acceptJson()
            ->timeout((int) config('chat_connectors.timeout_seconds', 12))
            ->post(self::BASE.$path, $payload);
        return $response->status() === 202 ? ['accepted' => true] : $this->body($response);
    }

    public function account(string $token): string
    {
        $person = $this->get($token, '/me', ['$select' => 'mail,userPrincipalName']);
        $address = $person['mail'] ?? $person['userPrincipalName'] ?? null;
        if (!is_string($address) || !filter_var($address, FILTER_VALIDATE_EMAIL)) {
            throw new RuntimeException('Microsoft did not return an account email.');
        }
        return $address;
    }

    private function body($response): array
    {
        if (!$response->successful() || !is_array($response->json())) {
            throw new RuntimeException('Microsoft refused this request. Check the connection and its access.');
        }
        return $response->json();
    }
}
