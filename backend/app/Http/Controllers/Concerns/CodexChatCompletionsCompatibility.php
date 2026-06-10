<?php

namespace App\Http\Controllers\Concerns;

use App\Models\ChatCostReservation;
use App\Services\Billing\ChatCostReservationService;
use GuzzleHttp\Client as GuzzleClient;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

trait CodexChatCompletionsCompatibility
{
    private function codexUsesChatCompletions(string $model): bool
    {
        return ! str_starts_with(strtolower($model), 'openai/');
    }

    private function codexChatCompletions(
        array $payload,
        ChatCostReservationService $reservationService,
        ChatCostReservation $reservation,
        int $estimatedInputTokens,
        int $maxOutputTokens,
    ): Response {
        try {
            $client = app()->bound('vibyra.openrouter_chat_client')
                ? app('vibyra.openrouter_chat_client')
                : new GuzzleClient(['timeout' => 300, 'connect_timeout' => 10, 'http_errors' => false]);
            $provider = $client->post((string) config('services.openrouter.url'), [
                'headers' => [
                    'Authorization' => 'Bearer '.config('services.openrouter.key'),
                    'Accept' => 'application/json',
                    'Content-Type' => 'application/json',
                    'HTTP-Referer' => (string) config('app.url', 'http://localhost'),
                    'X-Title' => 'Vibyra',
                    'X-OpenRouter-Metadata' => 'enabled',
                ],
                'json' => $this->codexChatPayload($payload),
            ]);
        } catch (Throwable $error) {
            $reservationService->settle($reservation, [[
                'billable' => true,
                'outcome' => 'provider_transport_error',
                'charge_reserved_estimate' => true,
            ]], [
                'outcome' => 'error',
                'stream_terminal_type' => 'provider_transport_error',
            ]);

            return $this->codexError('Could not reach OpenRouter: '.$error->getMessage(), 502);
        }

        $decoded = json_decode((string) $provider->getBody()->getContents(), true);
        if ($provider->getStatusCode() >= 400) {
            $usage = $this->codexUsage((array) ($decoded['usage'] ?? []), $decoded);
            if ($usage !== []) {
                $reservationService->settle($reservation, [[
                    'billable' => true,
                    'outcome' => 'provider_error',
                    'usage' => $usage,
                ]], ['outcome' => 'provider_error']);
            } else {
                $reservationService->release($reservation, 'provider_error_without_usage');
            }

            return $this->codexError(
                $this->codexProviderErrorMessage($decoded),
                $provider->getStatusCode(),
            );
        }

        $response = $this->codexResponseFromChat($decoded, (string) ($payload['model'] ?? ''));
        $usage = $this->codexUsage((array) ($decoded['usage'] ?? []), $decoded);
        if ($response === null) {
            $reservationService->settle($reservation, [[
                'billable' => true,
                'outcome' => 'provider_invalid_response',
                'usage' => $usage,
                'estimated_input_tokens' => $estimatedInputTokens,
                'estimated_output_tokens' => $maxOutputTokens,
            ]], [
                'outcome' => 'error',
                'stream_terminal_type' => 'provider_invalid_response',
            ]);

            return $this->codexError('OpenRouter returned an invalid terminal response.', 502);
        }

        $reservationService->settle($reservation, [[
            'billable' => true,
            'outcome' => 'response.completed',
            'usage' => $usage,
            'estimated_input_tokens' => $estimatedInputTokens,
            'estimated_output_tokens' => $maxOutputTokens,
        ]], [
            'outcome' => 'success',
            'stream_terminal_type' => 'response.completed',
        ]);

        return response($this->codexSyntheticStream($response), 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache, no-store',
            'X-Accel-Buffering' => 'no',
        ]);
    }

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
