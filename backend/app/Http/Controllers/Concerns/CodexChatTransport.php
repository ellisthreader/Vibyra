<?php

namespace App\Http\Controllers\Concerns;

use App\Models\ChatCostReservation;
use App\Services\Billing\ChatCostReservationService;
use GuzzleHttp\Client as GuzzleClient;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

trait CodexChatTransport
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
}
