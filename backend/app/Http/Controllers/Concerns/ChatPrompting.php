<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Http\Request;
use Illuminate\Support\Str;

trait ChatPrompting
{
    private function chatMessages(Request $request, string $prompt, ?array $skill = null): array
    {
        $project = trim((string) $request->input('project', ''));
        $filePath = trim((string) $request->input('filePath', ''));
        $fileBody = trim((string) $request->input('fileBody', ''));
        $projectFiles = $this->projectFilesContext((array) $request->input('projectFiles', []));
        $buildMode = $this->resolveChatMode($request, $prompt, $skill) === 'build';
        $history = $this->chatHistoryMessages((array) $request->input('history', []), $buildMode);
        $context = [];

        if ($project !== '') {
            $context[] = "Project: {$project}";
        }

        if ($projectFiles !== '') {
            $context[] = "Project files:\n{$projectFiles}";
            $context[] = "Answer rule: treat the listed files as the selected project's folder map, use the whole project shape first, then use snippets for detail. Do not respond with bash, grep, find, rg, npm, or terminal commands unless the user explicitly asks for commands.";
        }

        if ($filePath !== '' && $fileBody !== '') {
            $context[] = "File {$filePath}:\n".Str::limit($fileBody, 1200, '');
        }

        $contextText = $context ? "\n\n".implode("\n\n", $context) : '';
        $userText = $this->applySkillTemplate($skill, $prompt, $filePath).$contextText;
        $systemContent = $this->systemPrompt($buildMode);
        $skillAddon = trim((string) ($skill['system_prompt_addon'] ?? ''));
        if ($skillAddon !== '') {
            $systemContent .= "\n".$skillAddon;
        }

        return [
            ['role' => 'system', 'content' => $systemContent],
            ...$history,
            ['role' => 'user', 'content' => $userText],
        ];
    }

    private function applySkillTemplate(?array $skill, string $prompt, string $filePath): string
    {
        $template = trim((string) ($skill['prompt_template'] ?? ''));
        if ($template === '') {
            return $prompt;
        }
        return trim(strtr($template, [
            '{{prompt}}' => $prompt,
            '{{file}}' => $filePath !== '' ? $filePath : 'the current context',
        ]));
    }

    private function systemPrompt(bool $buildMode): string
    {
        if (! $buildMode) {
            return 'You are Vibyra, a senior coding assistant inside the Vibyra phone app. Be direct and concise. Prefer short answers and minimal code. Use the project/folder context first; focus on a single file only when the user explicitly asks about that file. For project analysis questions, synthesize the answer from the provided context instead of telling the user to run shell commands. If the user asks to run a terminal command, Vibyra can run approved project commands through the paired desktop app; do not say terminal commands are impossible. Do not invent files or frameworks not shown in context. User-facing app/site preview guidance must be mobile-first: tell the user to tap the in-app Live Preview card, not to open localhost, 127.0.0.1, or a desktop browser URL, unless they explicitly ask about backend/dev setup.';
        }

        return implode("\n", [
            'You are Vibyra, a senior coding agent for an app builder. Be direct and concise.',
            'When the user asks to build/create/make an app, tool, page, dashboard, calculator, game, site, or website, return a runnable preview EXACTLY as:',
            '<vibyra-app title="Short Name"><!doctype html><html>...self-contained HTML with inline <style> and <script>...</html></vibyra-app>',
            'Rules: one self-contained HTML doc; no external <script src>, ESM imports, or CDN frameworks for core app logic; localStorage for persistence; dark theme (#0B0D17 bg, #E7E3EF text); responsive for 375px width; real interactive functionality.',
            'The user is viewing this from the Vibyra phone app. Do not tell them to visit localhost, 127.0.0.1, or a desktop browser URL; the app will attach the runnable output as a Live Preview card they can tap.',
            'Phone previews run in a sandboxed iframe/WebView srcdoc where external scripts may be blocked. Do not rely on Three.js, Phaser, React, Babel, Tailwind JS, or other CDN globals. For games and 3D, prefer vanilla canvas/WebGL/CSS/inline SVG with all code inline.',
            'If a library is unavoidable, the app must first check that it loaded and provide an inline browser-native fallback that remains playable/usable instead of throwing ReferenceError.',
            'Do not invent or reference image asset URLs, local files, or asset CDNs (especially cdn.jsdelivr.net/gh/vibyra/assets@main); avoid Phaser external sprite URLs unless verified. Use canvas drawing, inline SVG symbols, CSS shapes/gradients, emoji, or generated data/blob-safe inline assets.',
            'Return only the <vibyra-app> block. Do not add prose, markdown, walkthroughs, or a conversational introduction.',
            'All JavaScript must be valid. When assigning HTML strings, use quoted strings or template literals; never write raw HTML after an equals sign.',
        ]);
    }

    private function isBuildPrompt(string $prompt): bool
    {
        $p = Str::lower($prompt);
        if (! preg_match('/\b(build|create|make|generate|design|prototype)\b/', $p)) {
            return false;
        }
        return (bool) preg_match('/\b(app|tool|page|tracker|dashboard|calculator|game|ui|widget|landing|form|site|website|screen|preview)\b/', $p)
            || (bool) preg_match('/^\s*(please\s+|pls\s+)?(build|create|generate|design|prototype)\s+(it|this|that)\b/', $p);
    }

    private function chatHistoryMessages(array $history, bool $buildMode): array
    {
        $messages = [];
        $window = $buildMode ? 4 : 3;
        $perMessage = $buildMode ? 1200 : 600;

        foreach (array_slice($history, -$window) as $item) {
            if (! is_array($item)) {
                continue;
            }

            $role = (string) ($item['role'] ?? '');
            $text = trim((string) ($item['text'] ?? ''));

            if (! in_array($role, ['assistant', 'user'], true) || $text === '') {
                continue;
            }

            $messages[] = [
                'role' => $role,
                'content' => Str::limit($text, $perMessage, ''),
            ];
        }

        return $messages;
    }

    private function suggestChatTitle(Request $request, string $prompt, string $reply): string
    {
        $project = trim((string) $request->input('project', ''));
        $source = Str::lower($prompt.' '.$reply.' '.$project);

        $patterns = [
            'auth' => 'Auth flow',
            'login' => 'Login screen',
            'signup' => 'Signup flow',
            'community' => 'Community page',
            'comment' => 'Comments',
            'moderation' => 'Moderation',
            'dashboard' => 'Dashboard',
            'profile' => 'Profile page',
            'billing' => 'Billing',
            'chat' => 'AI chat',
            'project' => 'Project builder',
            'landing' => 'Landing page',
            'pricing' => 'Pricing page',
            'api' => 'API integration',
            'database' => 'Database',
            'upload' => 'Uploads',
            'screenshot' => 'Screenshots',
        ];

        foreach ($patterns as $keyword => $title) {
            if (str_contains($source, $keyword)) {
                return $title;
            }
        }

        $words = collect(preg_split('/[^a-z0-9]+/i', $prompt) ?: [])
            ->map(fn ($word) => trim((string) $word))
            ->filter(fn ($word) => strlen($word) > 2 && ! in_array(Str::lower($word), [
                'the', 'and', 'for', 'with', 'that', 'this', 'you', 'can', 'make', 'build', 'create', 'please', 'should',
            ], true))
            ->take(4)
            ->values();

        if ($words->isEmpty()) {
            return $project !== '' ? $project : 'New build';
        }

        return Str::headline($words->implode(' '));
    }
}
