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
        $buildMode = ($skill['mode'] ?? null) === 'build' || $this->isBuildPrompt($prompt);
        $history = $this->chatHistoryMessages((array) $request->input('history', []), $buildMode);
        $context = [];

        if ($project !== '') {
            $context[] = "Project: {$project}";
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
            return 'You are Vibyra, a senior coding assistant. Be direct and concise. Prefer short answers and minimal code. Do not invent files or frameworks not shown in context.';
        }

        return implode("\n", [
            'You are Vibyra, a senior coding agent for an app builder. Be direct and concise.',
            'When the user asks to build/create/make an app, tool, page, dashboard, calculator, or game, return a runnable preview EXACTLY as:',
            '<vibyra-app title="Short Name"><!doctype html><html>...self-contained HTML with inline <style> and <script>...</html></vibyra-app>',
            'Rules: one self-contained HTML doc; CDNs only from cdn.jsdelivr.net, unpkg.com, cdn.tailwindcss.com, fonts.googleapis.com, fonts.gstatic.com; localStorage for persistence; dark theme (#0B0D17 bg, #E7E3EF text); responsive for 375px width; real interactive functionality.',
            'Before the block, write 1-2 short sentences introducing what you built. Do NOT repeat the HTML or include walkthroughs.',
        ]);
    }

    private function isBuildPrompt(string $prompt): bool
    {
        $p = Str::lower($prompt);
        if (! preg_match('/\b(build|create|make|generate|design|prototype)\b/', $p)) {
            return false;
        }
        return (bool) preg_match('/\b(app|tool|page|tracker|dashboard|calculator|game|ui|widget|landing|form|site|website|screen)\b/', $p);
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
