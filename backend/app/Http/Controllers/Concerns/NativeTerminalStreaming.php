<?php

namespace App\Http\Controllers\Concerns;

use App\Models\ChatCostReservation;
use App\Services\Billing\ChatCostReservationService;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

trait NativeTerminalStreaming
{
    private function streamNativeTerminalResponse(
        $provider,
        string $protocol,
        ChatCostReservationService $reservations,
        ChatCostReservation $reservation,
        int $estimatedInput,
        int $estimatedOutput,
    ): StreamedResponse {
        return new StreamedResponse(function () use (
            $provider, $protocol, $reservations, $reservation, $estimatedInput, $estimatedOutput
        ) {
            $body = $provider->getBody();
            $buffer = '';
            $usage = [];
            $toolCalls = [];
            $completed = false;
            $previousIgnoreUserAbort = ignore_user_abort(true);
            try {
                while (! $body->eof()) {
                    if (function_exists('connection_aborted') && connection_aborted() === 1) {
                        break;
                    }
                    $chunk = $body->read(8192);
                    if ($chunk === '') {
                        $size = $body->getSize();
                        if ($body->eof() || ($size !== null && $body->tell() >= $size)) {
                            break;
                        }
                        usleep(10000);
                        continue;
                    }
                    if ($protocol === 'anthropic') {
                        echo $chunk;
                    }
                    $buffer .= $chunk;
                    foreach ($this->nativeSseEvents($buffer) as $event) {
                        if ($protocol === 'gemini') {
                            $this->emitGeminiOpenRouterEvent($event, $usage, $toolCalls, $completed);
                        } else {
                            $data = $event['data'];
                            $eventUsage = (array) ($data['message']['usage'] ?? $data['usage'] ?? []);
                            if ($eventUsage !== []) {
                                $usage = array_merge($usage, $eventUsage);
                            }
                            if (in_array($event['event'], ['message_stop', 'error'], true)) {
                                $completed = $event['event'] === 'message_stop';
                            }
                        }
                    }
                    @ob_flush();
                    @flush();
                }
                if ($protocol === 'gemini' && ! $completed) {
                    $this->emitGeminiFinal($usage, $toolCalls);
                    $completed = true;
                }
            } catch (Throwable) {
                $completed = false;
            } finally {
                $body->close();
                ignore_user_abort((bool) $previousIgnoreUserAbort);
            }

            $reservations->settle($reservation, [[
                'billable' => true,
                'outcome' => $completed ? 'stream_completed' : 'stream_disconnected',
                'usage' => $this->terminalUsage($usage),
                'estimated_input_tokens' => $estimatedInput,
                'estimated_output_tokens' => $estimatedOutput,
            ]], ['outcome' => $completed ? 'success' : 'disconnected']);
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache, no-store',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    private function nativeSseEvents(string &$buffer): array
    {
        $events = [];
        while (preg_match("/\r?\n\r?\n/", $buffer, $match, PREG_OFFSET_CAPTURE) === 1) {
            $separator = $match[0][0];
            $offset = $match[0][1];
            $raw = substr($buffer, 0, $offset);
            $buffer = substr($buffer, $offset + strlen($separator));
            $name = '';
            $lines = [];
            foreach (preg_split("/\r?\n/", $raw) ?: [] as $line) {
                if (str_starts_with($line, 'event:')) {
                    $name = trim(substr($line, 6));
                } elseif (str_starts_with($line, 'data:')) {
                    $lines[] = ltrim(substr($line, 5));
                }
            }
            $rawData = implode("\n", $lines);
            if ($rawData === '[DONE]') {
                $events[] = ['event' => 'done', 'data' => []];
                continue;
            }
            $decoded = json_decode($rawData, true);
            $events[] = ['event' => $name, 'data' => is_array($decoded) ? $decoded : []];
        }

        return $events;
    }

    private function emitGeminiOpenRouterEvent(
        array $event,
        array &$usage,
        array &$toolCalls,
        bool &$completed,
    ): void {
        $data = $event['data'];
        if (is_array($data['usage'] ?? null)) {
            $usage = $data['usage'];
        }
        if ($completed) {
            return;
        }
        $choice = $data['choices'][0] ?? null;
        if (! is_array($choice)) {
            if ($event['event'] === 'done') {
                $this->emitGeminiFinal($usage, $toolCalls);
                $completed = true;
            }
            return;
        }
        $delta = is_array($choice['delta'] ?? null) ? $choice['delta'] : [];
        $parts = [];
        if (is_string($delta['content'] ?? null) && $delta['content'] !== '') {
            $parts[] = ['text' => $delta['content']];
        }
        foreach ((array) ($delta['tool_calls'] ?? []) as $call) {
            $index = (int) ($call['index'] ?? 0);
            $toolCalls[$index] ??= ['id' => '', 'name' => '', 'arguments' => ''];
            $toolCalls[$index]['id'] .= (string) ($call['id'] ?? '');
            $toolCalls[$index]['name'] .= (string) ($call['function']['name'] ?? '');
            $toolCalls[$index]['arguments'] .= (string) ($call['function']['arguments'] ?? '');
        }
        if ($parts !== []) {
            $this->emitGeminiChunk($parts, null, $usage);
        }
        if (($choice['finish_reason'] ?? null) !== null) {
            $this->emitGeminiFinal($usage, $toolCalls);
            $completed = true;
        }
    }

    private function emitGeminiFinal(array $usage, array $toolCalls): void
    {
        $parts = [];
        foreach ($toolCalls as $call) {
            $args = json_decode((string) ($call['arguments'] ?? ''), true);
            $parts[] = ['functionCall' => [
                'id' => (string) ($call['id'] ?? ''),
                'name' => (string) ($call['name'] ?? ''),
                'args' => is_array($args) ? $args : (object) [],
            ]];
        }
        $this->emitGeminiChunk($parts, 'STOP', $usage);
    }

    private function emitGeminiChunk(array $parts, ?string $finishReason, array $usage): void
    {
        $candidate = ['content' => ['role' => 'model', 'parts' => $parts]];
        if ($finishReason !== null) {
            $candidate['finishReason'] = $finishReason;
        }
        echo 'data: '.json_encode([
            'candidates' => [$candidate],
            'usageMetadata' => $this->geminiUsage($usage),
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)."\n\n";
    }
}
