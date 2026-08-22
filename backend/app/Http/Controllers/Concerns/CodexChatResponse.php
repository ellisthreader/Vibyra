<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Support\Str;

trait CodexChatResponse
{
    private function codexResponseFromChat(array $payload, string $model): ?array
        {
            $message = $payload['choices'][0]['message'] ?? null;
            if (! is_array($message)) {
                return null;
            }
            $output = [];
            $text = $this->codexChatText($message['content'] ?? '');
            if ($text !== '') {
                $output[] = [
                    'id' => 'msg_'.Str::uuid(),
                    'type' => 'message',
                    'status' => 'completed',
                    'role' => 'assistant',
                    'content' => [[
                        'type' => 'output_text',
                        'text' => $text,
                        'annotations' => [],
                    ]],
                ];
            }
            foreach ((array) ($message['tool_calls'] ?? []) as $toolCall) {
                if (! is_array($toolCall) || ! is_array($toolCall['function'] ?? null)) {
                    continue;
                }
                $callId = (string) ($toolCall['id'] ?? 'call_'.Str::uuid());
                $output[] = [
                    'id' => 'fc_'.Str::uuid(),
                    'type' => 'function_call',
                    'status' => 'completed',
                    'call_id' => $callId,
                    'name' => (string) ($toolCall['function']['name'] ?? ''),
                    'arguments' => $this->codexArguments($toolCall['function']['arguments'] ?? '{}'),
                ];
            }
            if ($output === []) {
                return null;
            }
            $usage = (array) ($payload['usage'] ?? []);
            return [
                'id' => (string) ($payload['id'] ?? 'resp_'.Str::uuid()),
                'object' => 'response',
                'status' => 'completed',
                'model' => $model,
                'output' => $output,
                'usage' => [
                    'input_tokens' => (int) ($usage['prompt_tokens'] ?? 0),
                    'output_tokens' => (int) ($usage['completion_tokens'] ?? 0),
                    'total_tokens' => (int) ($usage['total_tokens'] ?? 0),
                ],
                'openrouter_metadata' => array_filter([
                    'cost' => isset($usage['cost']) ? (float) $usage['cost'] : null,
                ], static fn (mixed $value): bool => $value !== null),
            ];
        }
    private function codexSyntheticStream(array $response): string
        {
            $events = [[
                'type' => 'response.created',
                'response' => [...$response, 'status' => 'in_progress', 'output' => []],
            ]];
            foreach ($response['output'] as $index => $item) {
                $events[] = ['type' => 'response.output_item.added', 'output_index' => $index, 'item' => $item];
                if (($item['type'] ?? null) === 'message') {
                    $events[] = [
                        'type' => 'response.output_text.delta',
                        'output_index' => $index,
                        'content_index' => 0,
                        'item_id' => $item['id'],
                        'delta' => (string) ($item['content'][0]['text'] ?? ''),
                    ];
                } elseif (($item['type'] ?? null) === 'function_call') {
                    $events[] = [
                        'type' => 'response.function_call_arguments.delta',
                        'output_index' => $index,
                        'item_id' => $item['id'],
                        'delta' => $item['arguments'],
                    ];
                }
                $events[] = ['type' => 'response.output_item.done', 'output_index' => $index, 'item' => $item];
            }
            $events[] = ['type' => 'response.completed', 'response' => $response];
            return implode('', array_map(
                static fn (array $event): string => 'event: '.$event['type']."\n".
                    'data: '.json_encode($event, JSON_UNESCAPED_SLASHES)."\n\n",
                $events,
            ))."data: [DONE]\n\n";
        }
    private function codexArguments(mixed $arguments): string
        {
            return is_string($arguments)
                ? $arguments
                : (json_encode($arguments, JSON_UNESCAPED_SLASHES) ?: '{}');
        }
}
