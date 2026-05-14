<?php

namespace App\Services\Concerns;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Throwable;

trait OpenAiStreaming
{
    private function streamOpenAiResponse(array $project, string $prompt, string $model, string $reasoningEffort): string
    {
        $context = $this->projectContext($project);
        $openRouterModel = $this->resolveOpenRouterModel($model);
        $apiKey = (string) config('services.openrouter.key');

        if ($apiKey === '') {
            $message = 'OpenRouter is not configured on the desktop backend. Check OPENROUTER_API_KEY in backend/.env and restart the backend.';
            $this->recordEvent('OpenRouter', $message, 'error');
            abort(response()->json(['ok' => false, 'error' => $message], 502));
        }

        try {
            $response = Http::timeout(180)
                ->acceptJson()
                ->withToken($apiKey)
                ->withHeaders([
                    'HTTP-Referer' => (string) config('app.url', 'http://localhost'),
                    'X-Title' => 'Vibyra Desktop Agent',
                ])
                ->post((string) config('services.openrouter.url'), [
                    'model' => $openRouterModel,
                    'messages' => [
                        [
                            'role' => 'system',
                            'content' => implode("\n", [
                                'You are Vibyra, an AI software agent connected to a desktop project.',
                                'Build into the actual project files the user can run or preview, not into a detached explanation.',
                                'If the user asks for an app, website, page, or visual feature and the project has no obvious web entry, create or update a phone-viewable index.html in the project root.',
                                'The user is controlling this from the Vibyra phone app. User-facing preview guidance must say to tap/open the in-app Live Preview card, not to visit localhost, 127.0.0.1, or a desktop browser URL, unless the user explicitly asks for backend/dev setup.',
                                'Phone previews run in a browser iframe. Do not use react-native-webview, React Native native modules, Expo native modules, CocoaPods, or mobile-only imports in generated preview code; use browser HTML/CSS/JavaScript instead.',
                                'For new standalone previews, keep core app logic self-contained: no external <script src>, ESM imports, or CDN frameworks such as Three.js, Phaser, React, Babel, or Tailwind JS. Use vanilla canvas/WebGL/CSS/inline SVG for games and 3D effects.',
                                'If an existing project truly requires a browser library, guard every library global before use and include an inline fallback that keeps the preview running when the script is blocked.',
                                'Do not invent or reference image asset URLs, local files, or asset CDNs such as cdn.jsdelivr.net/gh/vibyra/assets@main. For image-like visuals, use canvas drawing, inline SVG symbols, CSS gradients/shapes, emoji/icons, or generated inline data/blob-safe assets; use public HTTPS image URLs only when they are verified to exist.',
                                'For Phaser games, prefer generated textures with Phaser Graphics/canvas/SVG data converted to runtime-safe blob URLs; do not call this.load.image with fake, local, or unverified external sprite URLs.',
                                'When files should change, return the files to write in this exact format and keep paths relative to the project root:',
                                '```json',
                                '{"files":[{"path":"relative/path.txt","content":"complete file contents"}]}',
                                '```',
                                'You may add a short explanation before or after the JSON, but the JSON must contain every file that should be created or replaced.',
                            ]),
                        ],
                        [
                            'role' => 'user',
                            'content' => implode("\n\n", [
                                'Project: '.$project['name'],
                                'Project path: '.$project['path'],
                                'Project context:',
                                $context,
                                'User request:',
                                $prompt,
                            ]),
                        ],
                    ],
                    'temperature' => 0.2,
                    'max_completion_tokens' => 4000,
                ]);
        } catch (Throwable) {
            $message = 'Could not reach OpenRouter. Please try again.';
            $this->recordEvent('OpenRouter', $message, 'error');
            abort(response()->json(['ok' => false, 'error' => $message], 502));
        }

        if (! $response->successful()) {
            $message = $response->json('error.message')
                ?: $response->json('message')
                ?: $this->openRouterStatusMessage($response->status());
            $this->recordEvent('OpenRouter', $message, 'error');
            abort(response()->json(['ok' => false, 'error' => $message], 502));
        }

        $responseText = trim((string) ($response->json('choices.0.message.content') ?? ''));

        if ($responseText !== '') {
            $this->recordEvent('OpenRouter', Str::limit($responseText, 220), 'info');
            $this->updateActiveAgentProgress(92);
        }

        $this->recordEvent('OpenRouter', 'Generation complete', 'success');

        return $responseText ?: 'OpenRouter returned no text.';
    }

    private function resolveOpenRouterModel(string $model): string
    {
        if (str_contains($model, '/')) {
            return $model;
        }

        return [
            'auto' => 'openai/gpt-4o-mini',
            'gpt-5.5' => 'openai/gpt-4o',
            'gpt-5.4' => 'openai/gpt-4o',
            'gpt-5.4-mini' => 'openai/gpt-4o-mini',
            'gpt-5.4-nano' => 'openai/gpt-4o-mini',
            'gpt-5-codex' => 'openai/gpt-4.1',
            'claude-opus-4' => 'anthropic/claude-opus-4',
            'claude-sonnet-4' => 'anthropic/claude-sonnet-4',
            'claude-3-5-haiku' => 'anthropic/claude-3.5-haiku',
            'gemini-2.5-pro' => 'google/gemini-2.5-pro',
            'gemini-2.5-flash' => 'google/gemini-2.5-flash',
            'gemini-2.0-flash' => 'google/gemini-2.0-flash-001',
        ][$model] ?? 'openai/gpt-4o-mini';
    }

    private function updateActiveAgentProgress(int $progress): void
    {
        $state = $this->read();
        if (empty($state['activeAgentRun'])) {
            return;
        }

        $state['activeAgentRun']['progress'] = $progress;
        $state['activeAgentRun']['updatedAt'] = now()->toISOString();
        $this->write($state);
    }

    private function openRouterStatusMessage(int $status): string
    {
        if ($status === 401) {
            return 'The desktop OpenRouter key is missing or invalid. Check OPENROUTER_API_KEY in backend/.env and restart the backend.';
        }

        if ($status === 429) {
            return 'OpenRouter rate-limited the desktop run. Wait a moment, then try again.';
        }

        if ($status >= 500) {
            return 'OpenRouter is temporarily unavailable. Try again in a moment.';
        }

        return 'OpenRouter request failed with HTTP '.$status;
    }
}
