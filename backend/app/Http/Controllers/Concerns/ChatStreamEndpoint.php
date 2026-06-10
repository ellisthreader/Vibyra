<?php

namespace App\Http\Controllers\Concerns;

use App\Services\AutoModelRouter;
use App\Services\Billing\BillingReservationException;
use App\Services\Billing\ChatCostReservationService;
use App\Services\Billing\CreditCalculator;
use App\Services\Billing\CreditDeductor;
use App\Services\Billing\OpenRouterRequestPolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

trait ChatStreamEndpoint
{
    use ChatEndpointHelpers;
    use ChatStreamResponder;

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
        $agentMode = $chatMode === 'build';

        $apiKey = (string) config('services.openrouter.key');
        if ($apiKey === '') {
            return $this->json(['ok' => false, 'error' => 'OpenRouter is not configured on the Vibyra backend.'], 500);
        }

        $reasoningEffort = $this->normalizeReasoningEffort((string) $request->input('reasoningEffort', 'medium'));
        $reasoningPayload = $this->buildReasoningPayload($reasoningEffort, $maxOutputTokens, $openRouterModel);

        $messages = $this->chatMessages($request, $prompt, $skill, $learningContext, $imageAttachments);
        $streamProviderResponse = ! $this->isDeepResearchModelKey($modelKey);
        $payload = $this->openRouterChatPayload(
            $openRouterModel,
            $messages,
            $maxOutputTokens,
            $reasoningPayload,
            $skill,
            $streamProviderResponse
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
        try {
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

        return $this->streamChatResponse(
            $payload, $apiKey, $user, $deductor, $calc, $modelKey, $requestedModelKey, $openRouterModel,
            $agentMode, $estimatedInputTokens, $skillId, $request, $prompt, $projectFiles, $chatMode, $streamProviderResponse,
            $autoRouting, $reservationService, $reservation, $reference, $maxOutputTokens
        );
    }
}
