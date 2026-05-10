<?php

namespace App\Http\Controllers\Concerns;

use App\Models\User;
use App\Services\Billing\CreditCalculator;
use App\Services\Billing\CreditDeductor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Throwable;

trait ChatEndpoint
{
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

        $history = $request->input('history');
        if ($history !== null && (! is_array($history) || count($history) > self::CHAT_HISTORY_MAX_ITEMS)) {
            return $this->json(['ok' => false, 'error' => 'Chat history payload is malformed or too large.'], 422);
        }

        $deductor->maybeResetDaily($user);

        $maxOutputTokens = $this->resolveMaxTokens($prompt, $skill);
        $estimatedInputTokens = $this->estimateInputTokens($prompt, $fileBody, is_array($history) ? $history : []);
        $agentMode = ($skill['mode'] ?? null) === 'build' || $this->isBuildPrompt($prompt);

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

        $apiKey = (string) config('services.openrouter.key');
        if ($apiKey === '') {
            return $this->json(['ok' => false, 'error' => 'OpenRouter is not configured on the Vibyra backend.'], 500);
        }

        $reasoningEffort = $this->normalizeReasoningEffort((string) $request->input('reasoningEffort', 'medium'));
        $reasoningPayload = $this->buildReasoningPayload($reasoningEffort, $maxOutputTokens);

        try {
            $payload = [
                'model' => $openRouterModel,
                'messages' => $this->chatMessages($request, $prompt, $skill),
                'temperature' => 0.25,
                'max_completion_tokens' => $maxOutputTokens,
                'usage' => ['include' => true],
            ];
            if ($reasoningPayload !== null) {
                $payload['reasoning'] = $reasoningPayload;
            }

            $response = Http::timeout(60)
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
        [$replyText, $app] = $this->extractRunnableApp($reply);

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

        return $this->json([
            'ok' => true,
            'reply' => $replyText,
            'app' => $app,
            'title' => $this->suggestChatTitle($request, $prompt, $replyText),
            'model' => $openRouterModel,
            'modelKey' => $modelKey,
            'creditCost' => abs($ledger->credits_delta),
            'creditsBalance' => $user->credits_balance,
            'creditsUsed' => $user->credits_used,
            'dailyCreditsUsed' => $user->daily_credits_used,
            'dailyCreditsCap' => $dailyCap,
            'user' => $this->userPayload($user),
        ]);
    }

    private function estimateInputTokens(string $prompt, string $fileBody, array $history): int
    {
        $chars = mb_strlen($prompt) + mb_strlen($fileBody);
        foreach ($history as $item) {
            if (is_array($item)) {
                $chars += mb_strlen((string) ($item['text'] ?? ''));
            }
        }
        // Conservative estimate: 1 token ≈ 3.5 chars (over-estimate so we don't under-charge).
        return (int) max(1, ceil($chars / 3.5));
    }

    private function enforceChatRateLimit(Request $request, int $userId, string $plan): ?JsonResponse
    {
        $perMinute = (int) config("billing.plans.{$plan}.rate_per_minute", 12);
        $perHour = (int) config("billing.plans.{$plan}.rate_per_hour", 200);
        $perIp = self::CHAT_PER_IP_PER_MINUTE;

        $perMinuteKey = "chat:user:{$userId}:1m";
        $perHourKey = "chat:user:{$userId}:1h";
        $perIpKey = 'chat:ip:' . sha1((string) $request->ip()) . ':1m';

        $limits = [
            [$perMinuteKey, $perMinute, 60, 'You are sending messages too fast. Wait a moment and try again.'],
            [$perHourKey, $perHour, 3600, 'Hourly chat limit reached. Try again later.'],
            [$perIpKey, $perIp, 60, 'Too many chat requests from this network. Wait a moment and try again.'],
        ];

        foreach ($limits as [$key, $max, $window, $message]) {
            if (RateLimiter::tooManyAttempts($key, $max)) {
                $retry = RateLimiter::availableIn($key);
                return $this->json([
                    'ok' => false,
                    'error' => $message,
                    'retryAfter' => $retry,
                ], 429);
            }
            RateLimiter::hit($key, $window);
        }

        return null;
    }

    private function resolveSkill(string $id): ?array
    {
        foreach ((array) config('skills.list', []) as $skill) {
            if (($skill['id'] ?? null) === $id) {
                return $skill;
            }
        }
        return null;
    }

    private function normalizeReasoningEffort(string $value): string
    {
        $value = strtolower(trim($value));
        return in_array($value, ['none', 'low', 'medium', 'high', 'xhigh'], true) ? $value : 'medium';
    }

    private function buildReasoningPayload(string $effort, int $maxOutputTokens): ?array
    {
        if ($effort === 'none') {
            return ['exclude' => true];
        }
        if ($effort === 'xhigh') {
            return [
                'effort' => 'high',
                'max_tokens' => max($maxOutputTokens * 4, 8000),
            ];
        }
        return ['effort' => $effort];
    }

    private function resolveMaxTokens(string $prompt, ?array $skill): int
    {
        $mode = $skill['mode'] ?? null;
        if ($mode === 'build' || ($mode === null && $this->isBuildPrompt($prompt))) {
            return 3000;
        }
        return 800;
    }

    private function extractRunnableApp(string $reply): array
    {
        if (! preg_match('/<vibyra-app(?:\s+title="([^"]*)")?\s*>([\s\S]*?)<\/vibyra-app>/i', $reply, $match)) {
            return [$reply, null];
        }

        $title = trim($match[1] ?? '') ?: 'Generated app';
        $html = trim($match[2] ?? '');
        if ($html === '') {
            return [$reply, null];
        }

        $cleanedReply = trim(preg_replace('/<vibyra-app[\s\S]*?<\/vibyra-app>/i', '', $reply));
        if ($cleanedReply === '') {
            $cleanedReply = "I built `{$title}` — tap the preview below to run it.";
        }

        return [$cleanedReply, [
            'id' => Str::uuid()->toString(),
            'title' => $title,
            'html' => $this->ensureContentSecurityPolicy($html),
        ]];
    }

    private function ensureContentSecurityPolicy(string $html): string
    {
        if (stripos($html, 'http-equiv="Content-Security-Policy"') !== false) {
            return $html;
        }

        $csp = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://cdn.jsdelivr.net https://unpkg.com;\">";

        if (stripos($html, '<head>') !== false) {
            return preg_replace('/<head>/i', "<head>\n{$csp}", $html, 1);
        }
        if (stripos($html, '<html') !== false) {
            return preg_replace('/<html([^>]*)>/i', "<html$1>\n<head>{$csp}</head>", $html, 1);
        }
        return "<!doctype html><html><head>{$csp}</head><body>{$html}</body></html>";
    }
}
