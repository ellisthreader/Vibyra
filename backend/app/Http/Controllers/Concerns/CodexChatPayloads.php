<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Support\Str;

trait CodexChatPayloads
{
    private function codexChatPayload(array $payload): array
        {
            $chat = array_filter([
                'model' => $payload['model'] ?? null,
                'messages' => $this->codexChatMessages($payload),
                'max_tokens' => $payload['max_output_tokens'] ?? null,
                'parallel_tool_calls' => $payload['parallel_tool_calls'] ?? null,
                'reasoning' => $payload['reasoning'] ?? null,
                'tool_choice' => $this->codexChatToolChoice($payload['tool_choice'] ?? null),
                'provider' => $payload['provider'] ?? null,
                'stream' => false,
            ], static fn (mixed $value): bool => $value !== null);
            $tools = [];
            foreach ((array) ($payload['tools'] ?? []) as $tool) {
                if (! is_array($tool) || ($tool['type'] ?? null) !== 'function') {
                    continue;
                }
                $tools[] = [
                    'type' => 'function',
                    'function' => array_filter([
                        'name' => $tool['name'] ?? null,
                        'description' => $tool['description'] ?? null,
                        'parameters' => $tool['parameters'] ?? (object) [],
                    ], static fn (mixed $value): bool => $value !== null),
                ];
            }
            if ($tools !== []) {
                $chat['tools'] = $tools;
            }
            return $chat;
        }
    private function codexChatMessages(array $payload): array
        {
            $messages = [];
            if (is_string($payload['instructions'] ?? null) && trim($payload['instructions']) !== '') {
                $messages[] = ['role' => 'system', 'content' => trim($payload['instructions'])];
            }
            foreach (is_array($payload['input'] ?? null) ? $payload['input'] : [$payload['input'] ?? ''] as $item) {
                if (is_string($item) && trim($item) !== '') {
                    $messages[] = ['role' => 'user', 'content' => $item];
                    continue;
                }
                if (! is_array($item)) {
                    continue;
                }
                if (($item['type'] ?? null) === 'function_call') {
                    $messages[] = [
                        'role' => 'assistant',
                        'tool_calls' => [[
                            'id' => (string) ($item['call_id'] ?? $item['id'] ?? Str::uuid()),
                            'type' => 'function',
                            'function' => [
                                'name' => (string) ($item['name'] ?? ''),
                                'arguments' => $this->codexArguments($item['arguments'] ?? '{}'),
                            ],
                        ]],
                    ];
                    continue;
                }
                if (($item['type'] ?? null) === 'function_call_output') {
                    $messages[] = [
                        'role' => 'tool',
                        'tool_call_id' => (string) ($item['call_id'] ?? $item['id'] ?? ''),
                        'content' => $this->codexChatText($item['output'] ?? ''),
                    ];
                    continue;
                }
                $role = (string) ($item['role'] ?? '');
                if (in_array($role, ['user', 'assistant', 'system', 'developer'], true)) {
                    $messages[] = [
                        'role' => $role === 'developer' ? 'system' : $role,
                        'content' => $this->codexChatText($item['content'] ?? ''),
                    ];
                }
            }
            return $messages !== [] ? $messages : [['role' => 'user', 'content' => 'General coding task']];
        }
    private function codexChatText(mixed $content): string
        {
            if (is_string($content)) {
                return $content;
            }
            $parts = [];
            foreach (is_array($content) ? $content : [] as $part) {
                if (is_string($part)) {
                    $parts[] = $part;
                } elseif (is_array($part) && isset($part['text'])) {
                    $parts[] = (string) $part['text'];
                }
            }
            return trim(implode("\n", $parts));
        }
    private function codexChatToolChoice(mixed $choice): mixed
        {
            if (! is_array($choice) || ($choice['type'] ?? null) !== 'function') {
                return $choice;
            }
            return [
                'type' => 'function',
                'function' => ['name' => (string) ($choice['name'] ?? '')],
            ];
        }
}
