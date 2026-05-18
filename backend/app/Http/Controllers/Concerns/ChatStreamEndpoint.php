<?php

namespace App\Http\Controllers\Concerns;

use App\Services\Billing\CreditCalculator;
use App\Services\Billing\CreditDeductor;
use App\Services\LevelProgression;
use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Exception\GuzzleException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

trait ChatStreamEndpoint
{
    use ChatEndpointHelpers;

    public function chatStream(Request $request)
    {
        $user = $this->authenticatedUser($request);
        $plan = $user->plan ?: 'free';

        $rateLimited = $this->enforceChatRateLimit($request, $user->id, $plan);
        if ($rateLimited !== null) {
            return $rateLimited;
        }

        $prompt = trim((string) $request->input('prompt', ''));
        $skillId = trim((string) $request->input('skill', ''));
        $skill = $skillId !== '' ? $this->resolveSkill($skillId) : null;

        $calc = app(CreditCalculator::class);
        $deductor = app(CreditDeductor::class);

        $modelKey = trim((string) $request->input('model', 'auto')) ?: 'auto';
        if (! $calc->modelConfig($modelKey)) {
            $modelKey = 'auto';
        }
        if (! $calc->planAllowsModel($plan, $modelKey)) {
            return $this->json([
                'ok' => false,
                'error' => 'Your plan does not include this model. Upgrade to use it, or pick a model included in your plan.',
                'requiredTier' => $calc->tier($modelKey),
                'plan' => $plan,
            ], 403);
        }

        $openRouterModel = $calc->resolveSlug($modelKey);

        if ($prompt === '') {
            return $this->json(['ok' => false, 'error' => 'Ask Vibyra something first.'], 422);
        }
        if (mb_strlen($prompt) > self::CHAT_PROMPT_MAX_CHARS) {
            return $this->json(['ok' => false, 'error' => 'That prompt is too long. Trim it to under ' . self::CHAT_PROMPT_MAX_CHARS . ' characters.'], 413);
        }

        $fileBody = (string) $request->input('fileBody', '');
        if (mb_strlen($fileBody) > self::CHAT_FILE_BODY_MAX_CHARS) {
            return $this->json(['ok' => false, 'error' => 'File context is too large for chat. Open the file in a project agent instead.'], 413);
        }
        $projectFiles = $this->projectFilesContext((array) $request->input('projectFiles', []));

        $history = $request->input('history');
        if ($history !== null && (! is_array($history) || count($history) > self::CHAT_HISTORY_MAX_ITEMS)) {
            return $this->json(['ok' => false, 'error' => 'Chat history payload is malformed or too large.'], 422);
        }

        $deductor->maybeResetDaily($user);

        $chatMode = $this->resolveChatMode($request, $prompt, $skill);
        $maxOutputTokens = $this->resolveMaxTokens($request, $prompt, $skill);
        $learningContext = $this->chatLearningContext($user, $request, $prompt, $chatMode);
        $estimatedInputTokens = $this->estimateInputTokens($prompt, $fileBody, is_array($history) ? $history : [], $projectFiles."\n".$learningContext);
        $agentMode = $chatMode === 'build';

        $estimatedCredits = $calc->estimateCredits($modelKey, $estimatedInputTokens, $maxOutputTokens, $agentMode);
        if ($user->credits_balance < $estimatedCredits) {
            return $this->json([
                'ok' => false,
                'error' => 'You do not have enough credits for this request. Top up or upgrade your plan to continue.',
                'creditsBalance' => $user->credits_balance,
                'creditsUsed' => $user->credits_used,
                'estimatedCredits' => $estimatedCredits,
            ], 402);
        }

        $dailyCap = $deductor->dailyCap($user);
        if ($dailyCap > 0 && (int) $user->daily_credits_used + $estimatedCredits > $dailyCap) {
            return $this->json([
                'ok' => false,
                'error' => 'Daily AI usage cap reached. The cap resets every 24 hours; upgrade your plan for a higher cap.',
                'dailyCap' => $dailyCap,
                'dailyCreditsUsed' => (int) $user->daily_credits_used,
            ], 429);
        }

        $burstCap = $deductor->burstCap($user);
        if ($burstCap > 0 && (int) $user->burst_credits_used + $estimatedCredits > $burstCap) {
            return $this->json([
                'ok' => false,
                'error' => '5-hour burst cap reached. Take a short break — your burst window resets every 5 hours.',
                'burstCap' => $burstCap,
                'burstCreditsUsed' => (int) $user->burst_credits_used,
                'burstCreditsResetAt' => optional($user->burst_credits_reset_at)->toIso8601String(),
            ], 429);
        }

        $weeklyCap = $deductor->weeklyCap($user);
        if ($weeklyCap > 0 && (int) $user->weekly_credits_used + $estimatedCredits > $weeklyCap) {
            return $this->json([
                'ok' => false,
                'error' => 'Weekly AI usage cap reached. The cap resets every 7 days; upgrade your plan for more headroom.',
                'weeklyCap' => $weeklyCap,
                'weeklyCreditsUsed' => (int) $user->weekly_credits_used,
                'weeklyCreditsResetAt' => optional($user->weekly_credits_reset_at)->toIso8601String(),
            ], 429);
        }

        $apiKey = (string) config('services.openrouter.key');
        if ($apiKey === '') {
            return $this->json(['ok' => false, 'error' => 'OpenRouter is not configured on the Vibyra backend.'], 500);
        }

        $reasoningEffort = $this->normalizeReasoningEffort((string) $request->input('reasoningEffort', 'medium'));
        $reasoningPayload = $this->buildReasoningPayload($reasoningEffort, $maxOutputTokens);

        $messages = $this->chatMessages($request, $prompt, $skill, $learningContext);
        $payload = [
            'model' => $openRouterModel,
            'messages' => $messages,
            'temperature' => 0.25,
            'max_completion_tokens' => $maxOutputTokens,
            'stream' => true,
            'usage' => ['include' => true],
        ];
        if ($reasoningPayload !== null) {
            $payload['reasoning'] = $reasoningPayload;
        }
        if ($this->shouldUseWebPlugin($skill)) {
            $payload['plugins'] = [['id' => 'web']];
        }

        return new StreamedResponse(function () use (
            $payload, $apiKey, $user, $deductor, $calc, $modelKey, $openRouterModel,
            $agentMode, $estimatedInputTokens, $skillId, $request, $prompt, $projectFiles, $chatMode
        ) {
            @ini_set('output_buffering', '0');
            @ini_set('zlib.output_compression', '0');
            while (ob_get_level() > 0) {
                @ob_end_flush();
            }
            ob_implicit_flush(true);

            $emit = function (string $event, array $data) {
                echo "event: {$event}\n";
                echo 'data: ' . json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n\n";
                @flush();
            };

            $accumulated = '';
            $usage = [];

            try {
                $client = new GuzzleClient([
                    'timeout' => 180,
                    'connect_timeout' => 10,
                ]);

                $response = $client->post((string) config('services.openrouter.url'), [
                    'headers' => [
                        'Authorization' => 'Bearer ' . $apiKey,
                        'Content-Type' => 'application/json',
                        'Accept' => 'text/event-stream',
                        'HTTP-Referer' => (string) config('app.url', 'http://localhost'),
                        'X-Title' => 'Vibyra',
                    ],
                    'json' => $payload,
                    'stream' => true,
                ]);

                if ($response->getStatusCode() >= 400) {
                    $body = (string) $response->getBody()->getContents();
                    $emit('error', ['error' => 'OpenRouter returned ' . $response->getStatusCode() . ': ' . Str::limit($body, 400, '')]);
                    return;
                }

                $body = $response->getBody();
                $buffer = '';

                while (! $body->eof()) {
                    $chunk = $body->read(4096);
                    if ($chunk === '' || $chunk === false) {
                        usleep(20000);
                        continue;
                    }
                    $buffer .= $chunk;

                    while (($newlinePos = strpos($buffer, "\n\n")) !== false) {
                        $rawEvent = substr($buffer, 0, $newlinePos);
                        $buffer = substr($buffer, $newlinePos + 2);

                        foreach (preg_split('/\r?\n/', $rawEvent) as $line) {
                            if (! str_starts_with($line, 'data:')) {
                                continue;
                            }
                            $data = trim(substr($line, 5));
                            if ($data === '' || $data === '[DONE]') {
                                continue;
                            }
                            $decoded = json_decode($data, true);
                            if (! is_array($decoded)) {
                                continue;
                            }
                            $delta = (string) ($decoded['choices'][0]['delta']['content'] ?? '');
                            if ($delta !== '') {
                                $accumulated .= $delta;
                                $emit('chunk', ['delta' => $delta]);
                            }
                            if (isset($decoded['usage']) && is_array($decoded['usage'])) {
                                $usage = $decoded['usage'];
                            }
                        }
                    }
                }
            } catch (GuzzleException | Throwable $error) {
                $emit('error', ['error' => 'Could not reach OpenRouter: ' . $error->getMessage()]);
                return;
            }

            if (trim($accumulated) === '') {
                $accumulated = 'I received an empty response from the selected model.';
                $emit('chunk', ['delta' => $accumulated]);
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
}
