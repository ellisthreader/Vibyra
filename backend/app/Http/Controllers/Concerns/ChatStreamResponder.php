<?php

namespace App\Http\Controllers\Concerns;

use App\Models\ChatCostReservation;
use App\Services\Billing\ChatCostReservationService;
use App\Services\LevelProgression;
use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Exception\GuzzleException;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;
trait ChatStreamResponder
{
    private function streamChatResponse(
        $payload, $apiKey, $user, $deductor, $calc, $modelKey, $requestedModelKey, $openRouterModel,
            $agentMode, $estimatedInputTokens, $skillId, $request, $prompt, $projectFiles, $chatMode, $streamProviderResponse,
            $autoRouting, ChatCostReservationService $reservationService, ChatCostReservation $reservation,
            string $reference, int $maxOutputTokens
    ): StreamedResponse
    {
        return new StreamedResponse(function () use (
            $payload, $apiKey, $user, $deductor, $calc, $modelKey, $requestedModelKey, $openRouterModel,
            $agentMode, $estimatedInputTokens, $skillId, $request, $prompt, $projectFiles, $chatMode, $streamProviderResponse,
            $autoRouting, $reservationService, $reservation, $reference, $maxOutputTokens
        ) {
            @ini_set('output_buffering', '0');
            @ini_set('zlib.output_compression', '0');
            if (! app()->runningUnitTests()) {
                while (ob_get_level() > 0) {
                    @ob_end_flush();
                }
                ob_implicit_flush(true);
            }

            $emit = function (string $event, array $data) {
                echo "event: {$event}\n";
                echo 'data: ' . json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n\n";
                @flush();
            };

            $accumulated = '';
            $usage = [];
            $attempts = [];

            try {
                $client = app()->bound("vibyra.openrouter_stream_client")
                    ? app("vibyra.openrouter_stream_client")
                    : new GuzzleClient([
                        "timeout" => $this->openRouterHttpTimeout($openRouterModel, $modelKey),
                        "connect_timeout" => 10,
                        "http_errors" => false,
                    ]);

                $reservationService->markProviderStarted($reservation);
                $response = $client->post((string) config('services.openrouter.url'), [
                    'headers' => [
                        'Authorization' => 'Bearer ' . $apiKey,
                        'Content-Type' => 'application/json',
                        'Accept' => $streamProviderResponse ? "text/event-stream" : "application/json",
                        'HTTP-Referer' => (string) config('app.url', 'http://localhost'),
                        'X-Title' => 'Vibyra',
                    ],
                    'json' => $payload,
                    'stream' => $streamProviderResponse,
                ]);

                if ($response->getStatusCode() >= 400) {
                    $body = (string) $response->getBody()->getContents();
                    $decodedError = json_decode($body, true);
                    $errorUsage = is_array($decodedError) ? (array) ($decodedError['usage'] ?? []) : [];
                    if ($errorUsage !== []) {
                        $reservationService->settle($reservation, [[
                            'billable' => true,
                            'outcome' => 'provider_error',
                            'usage' => $errorUsage,
                        ]], ['outcome' => 'provider_error']);
                    } else {
                        $reservationService->release($reservation, 'provider_error_without_usage');
                    }
                    $emit('error', ['error' => 'OpenRouter returned ' . $response->getStatusCode() . ': ' . Str::limit($body, 400, '')]);
                    return;
                }

                if (! $streamProviderResponse) {
                    $decoded = json_decode((string) $response->getBody()->getContents(), true);
                    if (! is_array($decoded)) {
                        $reservationService->settle($reservation, [[
                            'billable' => true,
                            'outcome' => 'unreadable_response',
                            'estimated_input_tokens' => $estimatedInputTokens,
                            'estimated_output_tokens' => $maxOutputTokens,
                        ]], ['outcome' => 'unreadable_response']);
                        $emit("error", ["error" => "OpenRouter returned an unreadable Deep Research response. Provider usage was charged."]);
                        return;
                    }

                    $attempts[] = [
                        'billable' => true,
                        'outcome' => 'completed',
                        'usage' => (array) ($decoded['usage'] ?? []),
                        'estimated_input_tokens' => $estimatedInputTokens,
                        'estimated_output_tokens' => $maxOutputTokens,
                    ];
                    $delta = $this->openRouterCompletionContent($decoded);
                    if ($delta === "") {
                        $retryPayload = $this->openRouterEmptyCompletionRetryPayload($payload);
                        if ($retryPayload !== null) {
                            $reservationService->markProviderStarted($reservation);
                            $retryResponse = $client->post((string) config('services.openrouter.url'), [
                                'headers' => [
                                    'Authorization' => 'Bearer ' . $apiKey,
                                    'Content-Type' => 'application/json',
                                    'Accept' => 'application/json',
                                    'HTTP-Referer' => (string) config('app.url', 'http://localhost'),
                                    'X-Title' => 'Vibyra',
                                ],
                                'json' => $retryPayload,
                                'stream' => false,
                            ]);

                            if ($retryResponse->getStatusCode() >= 400) {
                                $body = (string) $retryResponse->getBody()->getContents();
                                $retryError = json_decode($body, true);
                                $retryUsage = is_array($retryError) ? (array) ($retryError['usage'] ?? []) : [];
                                if ($retryUsage !== []) {
                                    $attempts[] = ['billable' => true, 'outcome' => 'retry_provider_error', 'usage' => $retryUsage];
                                }
                                $reservationService->settle($reservation, $attempts, ['outcome' => 'retry_provider_error']);
                                $emit('error', ['error' => 'OpenRouter returned ' . $retryResponse->getStatusCode() . ' on Deep Research retry: ' . Str::limit($body, 400, '')]);
                                return;
                            }

                            $retryDecoded = json_decode((string) $retryResponse->getBody()->getContents(), true);
                            if (is_array($retryDecoded)) {
                                $decoded = $retryDecoded;
                                $attempts[] = [
                                    'billable' => true,
                                    'outcome' => 'retry_completed',
                                    'usage' => (array) ($decoded['usage'] ?? []),
                                    'estimated_input_tokens' => $estimatedInputTokens,
                                    'estimated_output_tokens' => $maxOutputTokens,
                                ];
                                $delta = $this->openRouterCompletionContent($decoded);
                            }
                        }
                    }
                    if ($delta !== "") {
                        $accumulated .= $delta;
                        $emit("chunk", ["delta" => $delta]);
                    }
                    if (isset($decoded["usage"]) && is_array($decoded["usage"])) {
                        $usage = $decoded["usage"];
                    }
                } else {
                    $body = $response->getBody();
                    $buffer = "";

                    while (! $body->eof()) {
                        $chunk = $body->read(4096);
                        if ($chunk === "" || $chunk === false) {
                            usleep(20000);
                            continue;
                        }
                        $buffer .= $chunk;

                        [$events, $buffer] = $this->pullOpenRouterStreamEvents($buffer);
                        foreach ($events as $rawEvent) {
                            $this->handleOpenRouterStreamEvent($rawEvent, $emit, $accumulated, $usage);
                        }
                    }

                    foreach ($this->flushOpenRouterStreamEvents($buffer) as $rawEvent) {
                        $this->handleOpenRouterStreamEvent($rawEvent, $emit, $accumulated, $usage);
                    }
                    $attempts[] = [
                        'billable' => true,
                        'outcome' => 'stream_completed',
                        'usage' => $usage,
                        'estimated_input_tokens' => $estimatedInputTokens,
                        'estimated_output_tokens' => $maxOutputTokens,
                    ];
                }
            } catch (GuzzleException | Throwable $error) {
                if ($attempts !== []) {
                    $reservationService->settle($reservation, $attempts, ['outcome' => 'transport_error_after_attempt']);
                }
                $emit('error', ['error' => 'Could not reach OpenRouter: ' . $error->getMessage()]);
                return;
            }

            if (trim($accumulated) === "") {
                $reservationService->settle($reservation, $attempts, ['outcome' => 'empty_completion']);
                $emit("error", ["error" => "OpenRouter completed the stream without answer content. Provider usage was charged."]);
                return;
            }

            try {
                [$replyText, $app] = $this->extractRunnableApp($accumulated, $agentMode);
                $replyText = $this->guardedChatReply($prompt, $replyText, $projectFiles, $agentMode, $app !== null);

                $ledger = $reservationService->settle($reservation, $attempts, ['outcome' => 'success']);
                $levelActivity = app(LevelProgression::class)->record(
                    $user,
                    $agentMode ? 'coding_agent_completed' : 'cloud_chat_completed',
                    $reference,
                    ['model' => $modelKey, 'credits' => abs($ledger->credits_delta)],
                );
                $this->rememberChatLearningOutcome($user, $request, $prompt, $replyText, $app, $modelKey, $chatMode, $reference);
                $user = $user->fresh() ?? $user;

                $emit('final', [
                    'ok' => true,
                    'reply' => $replyText,
                    'app' => $app,
                    'title' => $this->suggestChatTitle($request, $prompt, $replyText),
                    'model' => $openRouterModel,
                    'modelKey' => $modelKey,
                    'requestedModelKey' => $requestedModelKey,
                    'autoRouting' => $autoRouting,
                    'chatReference' => $reference,
                    'creditCost' => abs($ledger->credits_delta),
                    'creditsBalance' => $user->credits_balance,
                    'creditsUsed' => $user->credits_used,
                    'dailyCreditsUsed' => $user->daily_credits_used,
                    'dailyCreditsCap' => $deductor->dailyCap($user),
                    'levelActivity' => $levelActivity,
                    'user' => $this->userPayload($user),
                ]);
            } catch (Throwable $error) {
                $emit('error', ['error' => 'Stream finalization failed: ' . $error->getMessage()]);
            }
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache, no-store',
            'X-Accel-Buffering' => 'no',
            'Connection' => 'keep-alive',
        ]);
    }
    private function pullOpenRouterStreamEvents(string $buffer): array
    {
        $parts = preg_split("/\r?\n\r?\n/", $buffer);
        if (! is_array($parts) || count($parts) <= 1) {
            return [[], $buffer];
        }

        $remainder = array_pop($parts);
        return [$parts, (string) $remainder];
    }

    private function flushOpenRouterStreamEvents(string $buffer): array
    {
        return trim($buffer) === "" ? [] : [$buffer];
    }

    private function handleOpenRouterStreamEvent(string $rawEvent, callable $emit, string &$accumulated, array &$usage): void
    {
        $dataLines = [];
        foreach (preg_split("/\r?\n/", $rawEvent) ?: [] as $line) {
            if (! str_starts_with($line, "data:")) {
                continue;
            }
            $dataLines[] = ltrim(substr($line, 5));
        }

        if ($dataLines === []) {
            return;
        }

        $data = trim(implode("\n", $dataLines));
        if ($data === "" || $data === "[DONE]") {
            return;
        }

        $decoded = json_decode($data, true);
        if (! is_array($decoded)) {
            return;
        }

        $delta = $this->openRouterStreamContent($decoded);
        if ($delta !== "") {
            $accumulated .= $delta;
            $emit("chunk", ["delta" => $delta]);
        }

        if (isset($decoded["usage"]) && is_array($decoded["usage"])) {
            $usage = $decoded["usage"];
        }
    }

}
