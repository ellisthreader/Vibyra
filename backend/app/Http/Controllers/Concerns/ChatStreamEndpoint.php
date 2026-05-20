<?php

namespace App\Http\Controllers\Concerns;

use App\Services\Billing\CreditCalculator;
use App\Services\Billing\CreditDeductor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
        $imageAttachments = $this->chatImageAttachments($request);

        $deductor->maybeResetDaily($user);

        $chatMode = $this->resolveChatMode($request, $prompt, $skill);
        $maxOutputTokens = $this->resolveMaxTokens($request, $prompt, $skill);
        $learningContext = $this->chatLearningContext($user, $request, $prompt, $chatMode);
        $estimatedInputTokens = $this->estimateInputTokens($prompt, $fileBody, is_array($history) ? $history : [], $projectFiles."\n".$learningContext, $imageAttachments);
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

        return $this->streamChatResponse(
            $payload, $apiKey, $user, $deductor, $calc, $modelKey, $requestedModelKey, $openRouterModel,
            $agentMode, $estimatedInputTokens, $skillId, $request, $prompt, $projectFiles, $chatMode, $streamProviderResponse
        );
    }
}
