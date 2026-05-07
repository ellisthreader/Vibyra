<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Throwable;

trait ChatEndpoint
{
    public function chat(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $prompt = trim((string) $request->input('prompt', ''));
        $skillId = trim((string) $request->input('skill', ''));
        $skill = $skillId !== '' ? $this->resolveSkill($skillId) : null;
        $modelKey = trim((string) $request->input('model', 'auto')) ?: 'auto';
        $openRouterModel = $this->resolveOpenRouterModel($modelKey);
        $creditCost = $this->creditCost($modelKey);

        if ($prompt === '') {
            return $this->json(['ok' => false, 'error' => 'Ask Vibyra something first.'], 422);
        }

        if ($user->credits_balance < $creditCost) {
            return $this->json([
                'ok' => false,
                'error' => 'You are out of free credits. Upgrade your plan to keep using premium AI models.',
                'creditsBalance' => $user->credits_balance,
                'creditsUsed' => $user->credits_used,
            ], 402);
        }

        $apiKey = (string) config('services.openrouter.key');
        if ($apiKey === '') {
            return $this->json(['ok' => false, 'error' => 'OpenRouter is not configured on the Vibyra backend.'], 500);
        }

        try {
            $response = Http::timeout(60)
                ->acceptJson()
                ->withToken($apiKey)
                ->withHeaders([
                    'HTTP-Referer' => (string) config('app.url', 'http://localhost'),
                    'X-Title' => 'Vibyra',
                ])
                ->post((string) config('services.openrouter.url'), [
                    'model' => $openRouterModel,
                    'messages' => $this->chatMessages($request, $prompt, $skill),
                    'temperature' => 0.25,
                    'max_completion_tokens' => $this->resolveMaxTokens($prompt, $skill),
                ]);
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

        $user->forceFill([
            'credits_balance' => max(0, $user->credits_balance - $creditCost),
            'credits_used' => $user->credits_used + $creditCost,
        ])->save();

        return $this->json([
            'ok' => true,
            'reply' => $replyText,
            'app' => $app,
            'title' => $this->suggestChatTitle($request, $prompt, $replyText),
            'model' => $openRouterModel,
            'creditCost' => $creditCost,
            'creditsBalance' => $user->credits_balance,
            'creditsUsed' => $user->credits_used,
            'user' => $this->userPayload($user),
        ]);
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
