<?php

namespace App\Http\Controllers\Concerns;

trait NativeTerminalProtocol
{
    private function terminalModelKey(string $requested, string $provider): ?string
    {
        $model = trim($requested);
        $aliases = [
            'claude-opus-4.8' => 'anthropic/claude-opus-4.8',
            'claude-opus-4-8' => 'anthropic/claude-opus-4.8',
            'claude-sonnet-4.6' => 'anthropic/claude-sonnet-4.6',
            'claude-sonnet-4-6' => 'anthropic/claude-sonnet-4.6',
            'claude-haiku-4-5' => 'anthropic/claude-haiku-4.5',
            'gemini-3.1-pro-preview' => 'google/gemini-3.1-pro-preview',
            'gemini-3.5-flash' => 'google/gemini-3.5-flash',
        ];
        $candidate = $aliases[$model] ?? $model;
        if (! str_contains($candidate, '/')) {
            $candidate = $provider.'/'.$candidate;
        }
        if (! str_starts_with($candidate, $provider.'/')) {
            return null;
        }

        return app(\App\Services\Billing\CreditCalculator::class)->modelConfig($candidate)
            ? $candidate
            : null;
    }

    private function geminiChatPayload(array $request, string $model): array
    {
        $messages = [];
        $systemParts = $request['systemInstruction']['parts'] ?? [];
        $system = $this->geminiTextParts(is_array($systemParts) ? $systemParts : []);
        if ($system !== '') {
            $messages[] = ['role' => 'system', 'content' => $system];
        }

        $pendingCalls = [];
        foreach ((array) ($request['contents'] ?? []) as $content) {
            if (! is_array($content)) {
                continue;
            }
            $role = ($content['role'] ?? 'user') === 'model' ? 'assistant' : 'user';
            $text = $this->geminiTextParts((array) ($content['parts'] ?? []));
            $toolCalls = [];
            foreach ((array) ($content['parts'] ?? []) as $part) {
                if (! is_array($part)) {
                    continue;
                }
                if (is_array($part['functionCall'] ?? null)) {
                    $call = $part['functionCall'];
                    $id = trim((string) ($call['id'] ?? '')) ?: 'call_'.substr(hash('sha256', json_encode($call)), 0, 20);
                    $pendingCalls[(string) ($call['name'] ?? '')] = $id;
                    $toolCalls[] = [
                        'id' => $id,
                        'type' => 'function',
                        'function' => [
                            'name' => (string) ($call['name'] ?? ''),
                            'arguments' => json_encode($call['args'] ?? (object) [], JSON_UNESCAPED_SLASHES),
                        ],
                    ];
                }
                if (is_array($part['functionResponse'] ?? null)) {
                    $response = $part['functionResponse'];
                    $name = (string) ($response['name'] ?? '');
                    $messages[] = [
                        'role' => 'tool',
                        'tool_call_id' => (string) ($response['id'] ?? $pendingCalls[$name] ?? $name),
                        'content' => json_encode($response['response'] ?? (object) [], JSON_UNESCAPED_SLASHES),
                    ];
                }
            }
            if ($text !== '' || $toolCalls !== []) {
                $message = ['role' => $role, 'content' => $text];
                if ($toolCalls !== []) {
                    $message['tool_calls'] = $toolCalls;
                }
                $messages[] = $message;
            }
        }

        $config = is_array($request['generationConfig'] ?? null) ? $request['generationConfig'] : [];
        $payload = [
            'model' => $model,
            'messages' => $messages,
            'stream' => true,
            'stream_options' => ['include_usage' => true],
            'max_tokens' => max(1, min(8192, (int) ($config['maxOutputTokens'] ?? 2000))),
        ];
        foreach (['temperature' => 'temperature', 'topP' => 'top_p'] as $source => $target) {
            if (isset($config[$source]) && is_numeric($config[$source])) {
                $payload[$target] = (float) $config[$source];
            }
        }
        $tools = $this->geminiTools((array) ($request['tools'] ?? []));
        if ($tools !== []) {
            $payload['tools'] = $tools;
        }

        return $payload;
    }

    private function geminiTools(array $groups): array
    {
        $tools = [];
        foreach ($groups as $group) {
            foreach ((array) ($group['functionDeclarations'] ?? []) as $function) {
                if (! is_array($function) || trim((string) ($function['name'] ?? '')) === '') {
                    continue;
                }
                $tools[] = [
                    'type' => 'function',
                    'function' => [
                        'name' => (string) $function['name'],
                        'description' => (string) ($function['description'] ?? ''),
                        'parameters' => $function['parametersJsonSchema']
                            ?? $function['parameters']
                            ?? (object) [],
                    ],
                ];
            }
        }

        return $tools;
    }

    private function geminiTextParts(array $parts): string
    {
        $texts = [];
        foreach ($parts as $part) {
            if (is_array($part) && isset($part['text'])) {
                $texts[] = (string) $part['text'];
            }
        }

        return implode("\n", $texts);
    }

    private function terminalUsage(array $usage): array
    {
        $normalized = [
            'prompt_tokens' => (int) ($usage['prompt_tokens'] ?? $usage['input_tokens'] ?? 0),
            'completion_tokens' => (int) ($usage['completion_tokens'] ?? $usage['output_tokens'] ?? 0),
        ];
        if (isset($usage['cost'])) {
            $normalized['cost'] = (float) $usage['cost'];
        }
        return $normalized;
    }

    private function geminiUsage(array $usage): array
    {
        $prompt = (int) ($usage['prompt_tokens'] ?? 0);
        $completion = (int) ($usage['completion_tokens'] ?? 0);

        return [
            'promptTokenCount' => $prompt,
            'candidatesTokenCount' => $completion,
            'totalTokenCount' => $prompt + $completion,
        ];
    }
}
