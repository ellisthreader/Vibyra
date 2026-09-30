<?php

namespace App\Services\Composio;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/** Account-scoped Composio sessions with an explicit, reviewed tool allowlist. */
final class Client
{
    private const BASE = 'https://backend.composio.dev/api/v3.1/tool_router/session';

    public function session(string $user, string $toolkit, array $tools): string
    {
        if (!preg_match('/^[a-z][a-z0-9_]{1,63}$/D', $toolkit)
            || !$tools || count($tools) > 10 || count($tools) !== count(array_unique($tools))) {
            throw new RuntimeException('Choose a reviewed Composio toolkit and tools.');
        }
        foreach ($tools as $tool) {
            if (!is_string($tool) || !preg_match('/^[A-Z][A-Z0-9_]{2,127}$/D', $tool)
                || !str_starts_with($tool, strtoupper($toolkit).'_')) {
                throw new RuntimeException('The Composio tool does not belong to this toolkit.');
            }
        }
        $response = $this->request('post', self::BASE, [
            'user_id' => $user,
            'toolkits' => ['enable' => [$toolkit]],
            'tools' => [$toolkit => ['enable' => array_values($tools)]],
            'premium_usage' => false,
            'manage_connections' => ['enable' => false],
            'workbench' => ['enable' => false],
            'search' => ['enable' => false],
            'execute' => ['enable_multi_execute' => false],
            'preload' => ['tools' => array_values($tools)],
        ]);
        $id = $response['session_id'] ?? null;
        if (!is_string($id) || !preg_match('/^trs_[A-Za-z0-9_-]{6,}$/D', $id)) {
            throw new RuntimeException('Composio did not create a scoped session.');
        }
        return $id;
    }

    public function execute(string $session, string $tool, array $arguments): array
    {
        if (!preg_match('/^trs_[A-Za-z0-9_-]{6,}$/D', $session)
            || !preg_match('/^[A-Z][A-Z0-9_]{2,127}$/D', $tool)) {
            throw new RuntimeException('Invalid Composio execution request.');
        }
        $response = $this->request('post', self::BASE.'/'.$session.'/execute', [
            'tool_slug' => $tool, 'arguments' => (object) $arguments,
            'enable_auto_workbench_offload' => false,
        ]);
        if (!empty($response['error'])) {
            throw new RuntimeException('Composio could not complete the tool call.');
        }
        $data = $response['data'] ?? null;
        if (!is_array($data)) throw new RuntimeException('Composio returned no structured result.');
        return $data;
    }

    public function close(string $session): void
    {
        if (!preg_match('/^trs_[A-Za-z0-9_-]{6,}$/D', $session)) return;
        $key = (string) config('chat_connectors.composio_api_key', '');
        if ($key === '') return;
        try {
            Http::withHeaders(['x-api-key' => $key])->timeout(8)
                ->withOptions(['allow_redirects' => false])->delete(self::BASE.'/'.$session);
        } catch (\Throwable) {
            // A remote cleanup failure must not erase a completed read receipt.
        }
    }

    private function request(string $method, string $url, array $body): array
    {
        $key = (string) config('chat_connectors.composio_api_key', '');
        if ($key === '') throw new RuntimeException('Composio is not configured.');
        $response = Http::withHeaders(['x-api-key' => $key])->acceptJson()
            ->asJson()->timeout(15)->withOptions(['allow_redirects' => false])
            ->{$method}($url, $body);
        if (!$response->successful() || strlen($response->body()) > 100_000) {
            throw new RuntimeException('Composio could not be reached just now.');
        }
        $data = $response->json();
        if (!is_array($data)) throw new RuntimeException('Composio returned an invalid response.');
        return $data;
    }
}
