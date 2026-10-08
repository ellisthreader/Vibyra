<?php

namespace App\Services\ModelCatalog;

use App\Services\Billing\OpenRouterReasoning;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/** A harmless tool roundtrip through the same required-parameter routing as terminals. */
final class Probe
{
    public function run(array $m): array
    {
        $tool = ['type' => 'function', 'function' => ['name' => 'catalog_echo',
            'description' => 'Return the catalog test word.', 'parameters' => ['type' => 'object',
                'properties' => ['word' => ['type' => 'string', 'enum' => ['ready']]], 'required' => ['word'], 'additionalProperties' => false]]];
        $base = ['model' => $m['id'], 'max_tokens' => 256,
            'provider' => ['require_parameters' => true, 'allow_fallbacks' => false,
                'max_price' => ['prompt' => (float) $m['pricing']['prompt'] * 1000000,
                    'completion' => (float) $m['pricing']['completion'] * 1000000]],
            'tools' => [$tool]];
        $messages = [['role' => 'user', 'content' => 'Call catalog_echo with word ready, then repeat the result.']];
        $first = $this->request([...$base, 'messages' => $messages,
            'tool_choice' => ['type' => 'function', 'function' => ['name' => 'catalog_echo']]], false);
        $call = $first['choices'][0]['message']['tool_calls'][0] ?? null;
        if (! is_array($call) || ! is_string($call['id'] ?? null)
            || ($call['function']['name'] ?? null) !== 'catalog_echo'
            || json_decode($call['function']['arguments'] ?? '', true) !== ['word' => 'ready']) {
            throw new RuntimeException('tool-call-refused');
        }
        $messages[] = ['role' => 'assistant', 'content' => null, 'tool_calls' => [$call]];
        $messages[] = ['role' => 'tool', 'tool_call_id' => $call['id'], 'content' => 'ready'];
        // Every offered effort must be accepted; one successful default is insufficient.
        foreach ($m['efforts'] ?: [null] as $effort) {
            $body = [...$base, 'messages' => $messages, 'stream' => true, 'tool_choice' => 'none'];
            if ($effort !== null) $body['reasoning'] = OpenRouterReasoning::request($m['reasoning'], $effort);
            $this->request($body, true);
        }
        return ['version' => 1, 'route' => 'openrouter', 'model' => $m['id'],
            'checks' => ['tool-call', 'tool-result', 'stream', 'efforts'], 'checkedAt' => now()->toIso8601String()];
    }

    private function request(array $body, bool $stream): array
    {
        $response = Http::withToken(config('model_catalog.probe_key'))->timeout(45)
            ->withOptions(['allow_redirects' => false])->post('https://openrouter.ai/api/v1/chat/completions', $body);
        if (! $response->successful()) throw new RuntimeException('provider-refused');
        if (! $stream) {
            if ($response->json('error') || ! is_array($response->json('choices'))) throw new RuntimeException('invalid-reply');
            return $response->json();
        }
        $raw = $response->body();
        if (strlen($raw) > 1000000 || ! str_contains($raw, '[DONE]')) throw new RuntimeException('incomplete-stream');
        $text = '';
        $finished = false;
        foreach (preg_split('/\r?\n/', $raw) as $line) {
            if (! str_starts_with($line, 'data: ') || $line === 'data: [DONE]') continue;
            $chunk = json_decode(substr($line, 6), true, 32, JSON_THROW_ON_ERROR);
            if (isset($chunk['error'])) throw new RuntimeException('stream-error');
            $text .= $chunk['choices'][0]['delta']['content'] ?? '';
            $finished = $finished || ($chunk['choices'][0]['finish_reason'] ?? null) === 'stop';
        }
        if (! $finished || ! str_contains(strtolower($text), 'ready')) throw new RuntimeException('tool-result-refused');
        return [];
    }
}
