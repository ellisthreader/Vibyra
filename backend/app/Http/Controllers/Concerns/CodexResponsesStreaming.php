<?php

namespace App\Http\Controllers\Concerns;

use App\Models\ChatCostReservation;
use App\Services\Billing\ChatCostReservationService;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

trait CodexResponsesStreaming
{
    private function streamCodexProviderResponse(
        $provider,
        ChatCostReservationService $reservationService,
        ChatCostReservation $reservation,
        int $estimatedInputTokens,
        int $maxOutputTokens,
    ): StreamedResponse {
        return new StreamedResponse(function () use (
            $provider,
            $reservationService,
            $reservation,
            $estimatedInputTokens,
            $maxOutputTokens,
        ) {
            $body = $provider->getBody();
            $buffer = '';
            $usage = [];
            $terminalType = null;
            $previousIgnoreUserAbort = ignore_user_abort(true);

            try {
                while (! $body->eof() && $terminalType === null) {
                    if ($this->codexClientDisconnected()) {
                        $terminalType = 'client_disconnected';
                        break;
                    }

                    $chunk = $body->read(8192);
                    if ($chunk === '') {
                        usleep(10000);
                        continue;
                    }
                    echo $chunk;
                    @ob_flush();
                    @flush();

                    $buffer .= $chunk;
                    foreach ($this->codexCompleteSseEvents($buffer) as $event) {
                        $type = (string) ($event['data']['type'] ?? $event['event'] ?? '');
                        if (! in_array($type, [
                            'response.completed',
                            'response.failed',
                            'response.incomplete',
                            'response.error',
                            'error',
                        ], true)) {
                            continue;
                        }

                        $terminalType = $type;
                        $response = is_array($event['data']['response'] ?? null)
                            ? $event['data']['response']
                            : $event['data'];
                        $usage = $this->codexUsage((array) ($response['usage'] ?? []), $response);
                        break;
                    }

                    if ($terminalType === null && $this->codexClientDisconnected()) {
                        $terminalType = 'client_disconnected';
                    }
                }
            } catch (Throwable) {
                $terminalType = 'stream_error';
            } finally {
                $body->close();
                ignore_user_abort((bool) $previousIgnoreUserAbort);
            }

            $terminalType ??= 'stream_ended_without_terminal';
            $outcome = match ($terminalType) {
                'response.completed' => 'success',
                'response.failed' => 'failed',
                'response.incomplete' => 'incomplete',
                'client_disconnected' => 'disconnected',
                default => 'error',
            };
            $reservationService->settle($reservation, [[
                'billable' => true,
                'outcome' => $terminalType,
                'usage' => $usage,
                'estimated_input_tokens' => $estimatedInputTokens,
                'estimated_output_tokens' => $maxOutputTokens,
            ]], [
                'outcome' => $outcome,
                'stream_terminal_type' => $terminalType,
            ]);
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache, no-store',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    private function codexCompleteSseEvents(string &$buffer): array
    {
        $events = [];
        while (preg_match("/\r?\n\r?\n/", $buffer, $match, PREG_OFFSET_CAPTURE) === 1) {
            $separator = $match[0][0];
            $offset = $match[0][1];
            $rawEvent = substr($buffer, 0, $offset);
            $buffer = substr($buffer, $offset + strlen($separator));
            $eventName = '';
            $dataLines = [];

            foreach (preg_split("/\r?\n/", $rawEvent) ?: [] as $line) {
                if (str_starts_with($line, 'event:')) {
                    $eventName = trim(substr($line, 6));
                } elseif (str_starts_with($line, 'data:')) {
                    $dataLines[] = ltrim(substr($line, 5));
                }
            }
            $decoded = json_decode(implode("\n", $dataLines), true);
            $events[] = [
                'event' => $eventName,
                'data' => is_array($decoded) ? $decoded : [],
            ];
        }

        return $events;
    }

    private function codexClientDisconnected(): bool
    {
        return function_exists('connection_aborted') && connection_aborted() === 1;
    }

    private function codexUsage(array $usage, mixed $response): array
    {
        if ($usage === []) {
            return [];
        }
        $normalized = [
            'prompt_tokens' => (int) ($usage['input_tokens'] ?? $usage['prompt_tokens'] ?? 0),
            'completion_tokens' => (int) ($usage['output_tokens'] ?? $usage['completion_tokens'] ?? 0),
        ];
        $cost = is_array($response) ? ($response['openrouter_metadata']['cost'] ?? null) : null;
        if (isset($usage['cost']) || is_numeric($cost)) {
            $normalized['cost'] = (float) ($usage['cost'] ?? $cost);
        }

        return $normalized;
    }
}
