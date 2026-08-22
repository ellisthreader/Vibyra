<?php

namespace App\Http\Controllers\Concerns;

use App\Services\Billing\ChatCostReservationService;
use Symfony\Component\HttpFoundation\Response;

trait NativeTerminalResponses
{
    private function finishNativeTerminalResponse(
            $response,
            string $protocol,
            ChatCostReservationService $reservations,
            $reservation,
            int $inputTokens,
            int $maxOutputTokens,
            string $providerId,
        ): Response {
            $decoded = json_decode((string) $response->getBody()->getContents(), true);
            if (! is_array($decoded)) {
                $reservations->settle($reservation, [[
                    'billable' => true, 'outcome' => 'unreadable_response',
                    'charge_reserved_estimate' => true,
                ]], ['outcome' => 'error']);
                return $this->nativeTerminalError(
                    'OpenRouter returned an unreadable response.', 502, $providerId
                );
            }
            $reservations->settle($reservation, [[
                'billable' => true,
                'outcome' => 'completed',
                'usage' => $this->terminalUsage((array) ($decoded['usage'] ?? [])),
                'estimated_input_tokens' => $inputTokens,
                'estimated_output_tokens' => $maxOutputTokens,
            ]], ['outcome' => 'success']);
            return response()->json(
                $protocol === 'gemini' ? $this->geminiNonStreamResponse($decoded) : $decoded
            );
        }
    private function anthropicTerminalPayload(array $payload, string $model, bool $stream): array
        {
            unset($payload['_vibyraHeaders']);
            $payload['model'] = $model;
            $payload['stream'] = $stream;
            return $payload;
        }
    private function nativeTerminalHeaders(string $apiKey, string $protocol, array $payload): array
        {
            $headers = [
                'Authorization' => 'Bearer '.$apiKey,
                'Content-Type' => 'application/json',
                'Accept' => ($payload['stream'] ?? false) ? 'text/event-stream' : 'application/json',
                'HTTP-Referer' => (string) config('app.url', 'http://localhost'),
                'X-Title' => 'Vibyra',
            ];
            if ($protocol === 'anthropic') {
                $headers['anthropic-version'] = (string) (
                    $payload['_vibyraHeaders']['anthropic-version'] ?? '2023-06-01'
                );
                $beta = trim((string) ($payload['_vibyraHeaders']['anthropic-beta'] ?? ''));
                if ($beta !== '') {
                    $headers['anthropic-beta'] = $beta;
                }
            }
            return $headers;
        }
    private function geminiNonStreamResponse(array $decoded): array
        {
            $message = (array) ($decoded['choices'][0]['message'] ?? []);
            $parts = [];
            if (is_string($message['content'] ?? null) && $message['content'] !== '') {
                $parts[] = ['text' => $message['content']];
            }
            foreach ((array) ($message['tool_calls'] ?? []) as $call) {
                $arguments = json_decode((string) ($call['function']['arguments'] ?? ''), true);
                $parts[] = ['functionCall' => [
                    'id' => (string) ($call['id'] ?? ''),
                    'name' => (string) ($call['function']['name'] ?? ''),
                    'args' => is_array($arguments) ? $arguments : (object) [],
                ]];
            }
            return [
                'candidates' => [[
                    'content' => ['role' => 'model', 'parts' => $parts],
                    'finishReason' => 'STOP',
                ]],
                'usageMetadata' => $this->geminiUsage((array) ($decoded['usage'] ?? [])),
            ];
        }
}
