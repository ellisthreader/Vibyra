<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Http\Request;
use Illuminate\Support\Str;

trait ChatPrompting
{
    private function chatMessages(Request $request, string $prompt): array
    {
        $project = trim((string) $request->input('project', ''));
        $filePath = trim((string) $request->input('filePath', ''));
        $fileBody = trim((string) $request->input('fileBody', ''));
        $context = [];
        $history = $this->chatHistoryMessages((array) $request->input('history', []));

        if ($project !== '') {
            $context[] = "Project: {$project}";
        }

        if ($filePath !== '' && $fileBody !== '') {
            $context[] = "Current file {$filePath}:\n{$fileBody}";
        }

        $contextText = $context ? "\n\nContext:\n".implode("\n\n", $context) : '';

        return [
            [
                'role' => 'system',
                'content' => implode("\n", [
                    'You are Vibyra, a senior coding agent for an app builder. Answer like Codex or ChatGPT inside a developer chat.',
                    'Be direct, specific, and useful. Do not invent file paths, components, or frameworks that are not in the provided context.',
                    'If the user asks for a code change, explain the exact change briefly and prefer concrete next steps over generic tutorial text.',
                    'Do not return placeholder comments like "Implement login logic here" unless the user explicitly asks for a sketch.',
                    'When code is useful, keep it minimal and production-shaped. When no code is needed, answer in clean prose.',
                    '',
                    'RUNNABLE APP MODE — when the user asks you to build, create, make, or generate an app, tool, page, tracker, dashboard, calculator, game, or any interactive UI, you MUST respond with a runnable preview.',
                    'Format the preview EXACTLY like this:',
                    '',
                    '<vibyra-app title="Short App Name">',
                    '<!doctype html>',
                    '<html>...complete self-contained HTML document with inline <style> and <script>...</html>',
                    '</vibyra-app>',
                    '',
                    'Rules for the preview HTML:',
                    '- ONE self-contained HTML document. No separate files. No imports of local files.',
                    '- All CSS goes inside <style> tags. All JS goes inside <script> tags.',
                    '- External resources are only allowed from these CDNs: cdn.jsdelivr.net, unpkg.com, cdn.tailwindcss.com, fonts.googleapis.com, fonts.gstatic.com.',
                    '- Use localStorage for any persistence. Do not call backend APIs.',
                    '- Make the UI look modern: dark theme by default (background near #0B0D17, text near #E7E3EF), rounded corners, generous spacing, sans-serif system font, mobile-friendly viewport meta tag.',
                    '- The app must work on a phone-sized WebView (assume 375px width). Use responsive layout.',
                    '- Include real interactive functionality, not placeholder copy.',
                    '',
                    'Before the <vibyra-app> block, write 1-2 short sentences introducing what you built. Do NOT include code blocks, file lists, install instructions, or "here is the HTML/CSS/JS" walkthroughs — the preview replaces all of that. Do NOT repeat the HTML outside the <vibyra-app> tags.',
                    'If the user asks a non-build question (explanations, debugging, opinions), answer normally without a <vibyra-app> block.',
                ]),
            ],
            ...$history,
            [
                'role' => 'user',
                'content' => $prompt.$contextText,
            ],
        ];
    }

    private function chatHistoryMessages(array $history): array
    {
        $messages = [];

        foreach (array_slice($history, -8) as $item) {
            if (! is_array($item)) {
                continue;
            }

            $role = (string) ($item['role'] ?? '');
            $text = trim((string) ($item['text'] ?? ''));

            if (! in_array($role, ['assistant', 'user'], true) || $text === '') {
                continue;
            }

            $file = trim((string) ($item['file'] ?? ''));
            $content = $file !== '' ? "File {$file}:\n{$text}" : $text;

            $messages[] = [
                'role' => $role,
                'content' => Str::limit($content, 2400, ''),
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
