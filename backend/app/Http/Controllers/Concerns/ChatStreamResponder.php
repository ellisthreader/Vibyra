<?php

namespace App\Http\Controllers\Concerns;

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
            $agentMode, $estimatedInputTokens, $skillId, $request, $prompt, $projectFiles, $chatMode, $streamProviderResponse
    ): StreamedResponse
    {
        return new StreamedResponse(function () use (
            $payload, $apiKey, $user, $deductor, $calc, $modelKey, $requestedModelKey, $openRouterModel,
            $agentMode, $estimatedInputTokens, $skillId, $request, $prompt, $projectFiles, $chatMode, $streamProviderResponse
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

            try {
                $client = app()->bound("vibyra.openrouter_stream_client")
                    ? app("vibyra.openrouter_stream_client")
                    : new GuzzleClient([
                        "timeout" => $this->openRouterHttpTimeout($openRouterModel, $modelKey),
                        "connect_timeout" => 10,
                        "http_errors" => false,
                    ]);

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
                    $emit('error', ['error' => 'OpenRouter returned ' . $response->getStatusCode() . ': ' . Str::limit($body, 400, '')]);
                    return;
                }

                if (! $streamProviderResponse) {
                    $decoded = json_decode((string) $response->getBody()->getContents(), true);
                    if (! is_array($decoded)) {
                        $emit("error", ["error" => "OpenRouter returned an unreadable Deep Research response. No Vibyra credits were charged."]);
                        return;
                    }

                    $delta = $this->openRouterCompletionContent($decoded);
                    if ($delta === "") {
                        $retryPayload = $this->openRouterEmptyCompletionRetryPayload($payload);
                        if ($retryPayload !== null) {
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
                                $emit('error', ['error' => 'OpenRouter returned ' . $retryResponse->getStatusCode() . ' on Deep Research retry: ' . Str::limit($body, 400, '')]);
                                return;
                            }

                            $retryDecoded = json_decode((string) $retryResponse->getBody()->getContents(), true);
                            if (is_array($retryDecoded)) {
                                $decoded = $retryDecoded;
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
                }
            } catch (GuzzleException | Throwable $error) {
                $emit('error', ['error' => 'Could not reach OpenRouter: ' . $error->getMessage()]);
                return;
            }

            if (trim($accumulated) === "") {
                $emit("error", ["error" => "OpenRouter completed the stream without answer content. No Vibyra credits were charged for this empty completion."]);
                return;
            }

            try {
                [$replyText, $app] = $this->extractRunnableApp($accumulated, $agentMode);
                $replyText = $this->guardedChatReply($prompt, $replyText, $projectFiles, $agentMode, $app !== null);

                $inputTokens = (int) ($usage['prompt_tokens'] ?? $estimatedInputTokens);
                $outputTokens = (int) ($usage['completion_tokens'] ?? max(1, (int) ceil(mb_strlen($accumulated) / 3.5)));
                $openRouterUsd = isset($usage['cost']) ? (float) $usage['cost'] : null;

                $reference = 'chat:' . Str::uuid()->toString();
                $ledger = $deductor->chargeForChat(
                    $user,
                    $modelKey,
                    $openRouterUsd,
                    $inputTokens,
                    $outputTokens,
                    $agentMode,
                    $reference,
                    ['skill' => $skillId ?: null],
                );
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
