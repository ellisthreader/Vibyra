<?php

namespace App\Services\Agents\BranchPublication;

use App\Services\ChatConnectors\Github\Client;
use Illuminate\Support\Facades\Http;

/** Fixed GitHub host, no redirects or automatic replay of writes. */
final class GitDataClient
{
    private const BASE = 'https://api.github.com';

    public function get(string $token, string $repository, string $path): array
    {
        return $this->request($token, $repository, $path, null);
    }

    public function post(string $token, string $repository, string $path, array $body): array
    {
        return $this->request($token, $repository, $path, $body);
    }

    /** Fast-forward ref update for a later Agent publish (force is always false). */
    public function patch(string $token, string $repository, string $path, array $body): array
    {
        return $this->request($token, $repository, $path, $body, 'patch');
    }

    private function request(string $token, string $repository, string $path, ?array $body, string $method = 'post'): array
    {
        try {
            $client = Http::withToken($token)->acceptJson()
                ->connectTimeout(5)->timeout((int) config('chat_connectors.timeout_seconds', 12))
                ->withOptions(['allow_redirects' => false])
                ->withHeaders(['Accept' => 'application/vnd.github+json',
                    'X-GitHub-Api-Version' => '2022-11-28']);
            $url = self::BASE.Client::path($repository).$path;
            $response = $body === null ? $client->get($url) : $client->{$method}($url, $body);
            $data = $response->json();
            return ['status' => $response->status(), 'data' => is_array($data) ? $data : null];
        } catch (\Throwable) {
            return ['status' => 0, 'data' => null];
        }
    }
}
