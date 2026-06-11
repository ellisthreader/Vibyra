<?php

namespace App\Http\Controllers\Concerns;

use App\Models\User;
use App\Services\AutoModelRouter;
use App\Services\Billing\BillingReservationException;
use App\Services\Billing\ChatCostReservationService;
use App\Services\Billing\CreditCalculator;
use App\Services\Billing\CreditDeductor;
use App\Services\Billing\OpenRouterRequestPolicy;
use App\Services\Billing\PlanEntitlements;
use App\Services\LevelProgression;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Throwable;

trait ChatEndpoint
{
    use ChatEndpointHelpers;

    private const CHAT_PROMPT_MAX_CHARS = 8000;
    private const CHAT_FILE_BODY_MAX_CHARS = 20000;
    private const CHAT_HISTORY_MAX_ITEMS = 20;
    private const CHAT_PER_IP_PER_MINUTE = 30;

    public function chat(Request $request): JsonResponse
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
        if ($prompt === '') {
            return $this->json(['ok' => false, 'error' => 'Ask Vibyra something first.'], 422);
        }
        if (mb_strlen($prompt) > self::CHAT_PROMPT_MAX_CHARS) {
            return $this->json(['ok' => false, 'error' => 'That prompt is too long. Trim it to under ' . self::CHAT_PROMPT_MAX_CHARS . ' characters.'], 413);
        }

        $calc = app(CreditCalculator::class);
        $deductor = app(CreditDeductor::class);

        $requestedModelKey = trim((string) $request->input('model', 'auto')) ?: 'auto';
        if (! $calc->modelConfig($requestedModelKey)) {
            $requestedModelKey = 'auto';
        }
        if ($this->requestedToolOnlyModelWithoutMatchingSkill($requestedModelKey, $skill, $calc)) {
            return $this->json([
                'ok' => false,
                'error' => 'This model is only available through its chat tool.',
            ], 422);
        }
        $modelKey = $this->effectiveChatModelKey($requestedModelKey, $skill);
        if (! $calc->modelConfig($modelKey)) {
            $modelKey = $requestedModelKey;
        }
        $autoRouting = null;
        if ($requestedModelKey === 'auto' && $modelKey === 'auto') {
            $routingPrompt = trim((string) $request->input('routingPrompt', $prompt)) ?: $prompt;
            $autoRouting = app(AutoModelRouter::class)->route(mb_substr($routingPrompt, 0, self::CHAT_PROMPT_MAX_CHARS), $plan, $calc);
            $modelKey = $autoRouting['modelKey'];
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

        $fileBody = (string) $request->input('fileBody', '');
        if (mb_strlen($fileBody) > self::CHAT_FILE_BODY_MAX_CHARS) {
            return $this->json(['ok' => false, 'error' => 'File context is too large for chat. Open the file in a project agent instead.'], 413);
        }
        $projectFiles = $this->projectFilesContext((array) $request->input('projectFiles', []));

        $history = $request->input('history');
        if ($history !== null && (! is_array($history) || count($history) > self::CHAT_HISTORY_MAX_ITEMS)) {
            return $this->json(['ok' => false, 'error' => 'Chat history payload is malformed or too large.'], 422);
        }
        $imageAttachments = $this->chatImageAttachments($request);

        $deductor->maybeResetDaily($user);

        $chatMode = $this->resolveChatMode($request, $prompt, $skill);
        $maxOutputTokens = $this->resolveMaxTokens($request, $prompt, $skill);
        $learningContext = $this->chatLearningContext($user, $request, $prompt, $chatMode);
        $estimatedInputTokens = $this->estimateInputTokens($prompt, $fileBody, is_array($history) ? $history : [], $projectFiles."\n".$learningContext, $imageAttachments);
        $maxOutputTokens = app(PlanEntitlements::class)->boundedOutputTokens(
            $plan,
            $estimatedInputTokens,
            $maxOutputTokens,
        );
        if ($maxOutputTokens === null) {
            return $this->contextLimitResponse($plan);
        }
        $agentMode = $chatMode === 'build';

        $apiKey = (string) config('services.openrouter.key');
        if ($apiKey === '') {
            return $this->json(['ok' => false, 'error' => 'OpenRouter is not configured on the Vibyra backend.'], 500);
        }

        $reasoningEffort = $this->normalizeReasoningEffort((string) $request->input('reasoningEffort', 'medium'));
        $reasoningPayload = $this->buildReasoningPayload($reasoningEffort, $maxOutputTokens, $openRouterModel);

        try {
            $payload = $this->openRouterChatPayload(
                $openRouterModel,
                $this->chatMessages($request, $prompt, $skill, $learningContext, $imageAttachments),
                $maxOutputTokens,
                $reasoningPayload,
                $skill
            );
            $payload['provider'] = app(OpenRouterRequestPolicy::class)->provider($modelKey);
            $maximumAttempts = $this->openRouterEmptyCompletionRetryPayload($payload) !== null ? 2 : 1;
            $estimatedCredits = $calc->estimateCredits($modelKey, $estimatedInputTokens, $maxOutputTokens, $agentMode) * $maximumAttempts;
            $estimatedMicroUsd = (int) ceil(
                ($calc->estimateReservationUsd($modelKey, $estimatedInputTokens, $maxOutputTokens)
                    + ((bool) ($skill['web_plugin'] ?? false)
                        ? (float) config('billing.openrouter_pricing.web_search_reservation_usd', 0.15)
                        : 0.0))
                * $maximumAttempts
                * 1_000_000
            );
            $reference = 'chat:' . Str::uuid()->toString();
            $reservationService = app(ChatCostReservationService::class);
            $reservation = $reservationService->reserve(
                $user,
                $reference,
                $modelKey,
                $estimatedCredits,
                $estimatedMicroUsd,
                ['skill' => $skillId ?: null, 'agent_mode' => $agentMode],
            );
        } catch (BillingReservationException $error) {
            return $this->json(array_merge([
                'ok' => false,
                'error' => $error->getMessage(),
                'code' => $error->errorCode,
            ], $error->details), $error->status);
        }

        $attempts = [];
        try {
            $reservationService->markProviderStarted($reservation);

            $response = Http::timeout($this->openRouterHttpTimeout($openRouterModel, $modelKey))
                ->acceptJson()
                ->withToken($apiKey)
                ->withHeaders([
                    'HTTP-Referer' => (string) config('app.url', 'http://localhost'),
                    'X-Title' => 'Vibyra',
                ])
                ->post((string) config('services.openrouter.url'), $payload);
        } catch (Throwable) {
            return $this->json(['ok' => false, 'error' => 'Could not reach OpenRouter. Please try again.'], 502);
        }

        if (! $response->successful()) {
            $usage = (array) ($response->json('usage') ?? []);
            if ($usage !== []) {
                $attempts[] = ['billable' => true, 'outcome' => 'provider_error', 'usage' => $usage];
                $reservationService->settle($reservation, $attempts, ['outcome' => 'provider_error']);
            } else {
                $reservationService->release($reservation, 'provider_error_without_usage');
            }
            $message = $response->json('error.message') ?: $response->json('message') ?: 'OpenRouter could not complete the request.';
            return $this->json(['ok' => false, 'error' => $message], $response->status() >= 400 ? $response->status() : 502);
        }

        $decoded = $response->json();
        $attempts[] = [
            'billable' => true,
            'outcome' => 'completed',
            'usage' => is_array($decoded) ? (array) ($decoded['usage'] ?? []) : [],
            'estimated_input_tokens' => $estimatedInputTokens,
            'estimated_output_tokens' => $maxOutputTokens,
        ];
        $reply = is_array($decoded) ? $this->openRouterCompletionContent($decoded) : '';
        if ($reply === '' && is_array($decoded)) {
            $retryPayload = $this->openRouterEmptyCompletionRetryPayload($payload);
            if ($retryPayload !== null) {
                try {
                    $reservationService->markProviderStarted($reservation);
                    $response = Http::timeout($this->openRouterHttpTimeout($openRouterModel, $modelKey))
                        ->acceptJson()
                        ->withToken($apiKey)
                        ->withHeaders([
                            'HTTP-Referer' => (string) config('app.url', 'http://localhost'),
                            'X-Title' => 'Vibyra',
                        ])
                        ->post((string) config('services.openrouter.url'), $retryPayload);
                } catch (Throwable) {
                    $reservationService->settle($reservation, $attempts, ['outcome' => 'retry_transport_error']);
                    return $this->json(['ok' => false, 'error' => 'Could not reach OpenRouter. Please try again.'], 502);
                }

                if (! $response->successful()) {
                    $usage = (array) ($response->json('usage') ?? []);
                    if ($usage !== []) {
                        $attempts[] = ['billable' => true, 'outcome' => 'retry_provider_error', 'usage' => $usage];
                    }
                    $reservationService->settle($reservation, $attempts, ['outcome' => 'retry_provider_error']);
                    $message = $response->json('error.message') ?: $response->json('message') ?: 'OpenRouter could not complete the Deep Research retry.';
                    return $this->json(['ok' => false, 'error' => $message], $response->status() >= 400 ? $response->status() : 502);
                }

                $decoded = $response->json();
                $attempts[] = [
                    'billable' => true,
                    'outcome' => 'retry_completed',
                    'usage' => is_array($decoded) ? (array) ($decoded['usage'] ?? []) : [],
                    'estimated_input_tokens' => $estimatedInputTokens,
                    'estimated_output_tokens' => $maxOutputTokens,
                ];
                $reply = is_array($decoded) ? $this->openRouterCompletionContent($decoded) : '';
            }
        }
        if ($reply === '') {
            $reservationService->settle($reservation, $attempts, ['outcome' => 'empty_completion']);
            return $this->json(['ok' => false, 'error' => 'OpenRouter completed without answer content. Provider usage was charged.'], 502);
        }
        [$replyText, $app] = $this->extractRunnableApp($reply, $agentMode);
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

        return $this->json([
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
    }

}
