<?php

namespace App\Http\Controllers\Concerns;

use App\Models\User;
use App\Services\Billing\CreditCalculator;
use App\Services\Billing\CreditDeductor;
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

        try {
            $payload = [
                'model' => $openRouterModel,
                'messages' => $this->chatMessages($request, $prompt, $skill, $learningContext),
                'temperature' => 0.25,
                'max_completion_tokens' => $maxOutputTokens,
                'usage' => ['include' => true],
            ];
            if ($reasoningPayload !== null) {
                $payload['reasoning'] = $reasoningPayload;
            }
            if ($this->shouldUseWebPlugin($skill)) {
                $payload['plugins'] = [['id' => 'web']];
            }

            $response = Http::timeout(90)
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
            $message = $response->json('error.message') ?: $response->json('message') ?: 'OpenRouter could not complete the request.';
            return $this->json(['ok' => false, 'error' => $message], $response->status() >= 400 ? $response->status() : 502);
        }

        $reply = (string) ($response->json('choices.0.message.content') ?? '');
        if ($reply === '') {
            $reply = 'I received an empty response from the selected model.';
        }
        [$replyText, $app] = $this->extractRunnableApp($reply, $agentMode);
        $replyText = $this->guardedChatReply($prompt, $replyText, $projectFiles, $agentMode, $app !== null);

        $usage = $response->json('usage') ?? [];
        $inputTokens = (int) ($usage['prompt_tokens'] ?? $estimatedInputTokens);
        $outputTokens = (int) ($usage['completion_tokens'] ?? 0);
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

        return $this->json([
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
            'dailyCreditsCap' => $dailyCap,
            'levelActivity' => $levelActivity,
            'user' => $this->userPayload($user),
        ]);
    }

}
