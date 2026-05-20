<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Http\Request;
use Illuminate\Support\Str;

trait ChatLearningTags
{
    private function chatLearningTokens(string $value): array
    {
        $stop = array_flip(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'you', 'can', 'please', 'what', 'when', 'where', 'how', 'why', 'make', 'give']);
        $words = preg_split('/[^a-z0-9_#.-]+/i', Str::lower($value)) ?: [];
        $tokens = [];
        foreach ($words as $word) {
            $word = trim($word, '.-_#');
            if (strlen($word) < 3 || isset($stop[$word])) {
                continue;
            }
            $tokens[$word] = true;
        }
        return array_keys($tokens);
    }

    private function chatLearningTags(string $prompt, string $mode, ?array $app, ?Request $request = null): array
    {
        $tags = $this->chatLearningSemanticTags($prompt.' '.($request?->input('filePath', '') ?? ''), $mode);
        foreach (['php', 'tsx', 'ts', 'js', 'css', 'blade'] as $extension) {
            if ($request !== null && str_ends_with(Str::lower((string) $request->input('filePath', '')), '.'.$extension)) {
                $tags[] = $extension;
            }
        }
        if ($request !== null && trim((string) $request->input('skill', '')) !== '') {
            $tags[] = 'skill:'.Str::limit(Str::slug((string) $request->input('skill')), 40, '');
        }
        if ($request !== null && count((array) $request->input('projectFiles', [])) > 0) {
            $tags[] = 'project-files';
        }
        if ($app !== null) {
            $tags[] = 'app';
        }
        return array_values(array_unique($tags));
    }

    private function chatLearningQueryTags(string $prompt, string $mode, Request $request): array
    {
        return $this->chatLearningTags($prompt, $mode, null, $request);
    }

    private function chatLearningSemanticTags(string $value, string $mode): array
    {
        $tags = [$mode];
        $lower = Str::lower($value);
        foreach (['error', 'fix', 'debug', 'preview', 'build', 'crash', 'stream', 'auth', 'billing', 'sync', 'desktop', 'pairing', 'route', 'database', 'migration', 'style', 'theme', 'color', 'ui'] as $tag) {
            if (str_contains($lower, $tag)) {
                $tags[] = $tag;
            }
        }
        return array_values(array_unique($tags));
    }

    private function chatLearningDecodeTags($value): array
    {
        $decoded = is_string($value) ? json_decode($value, true) : $value;
        if (! is_array($decoded)) {
            return [];
        }
        $tags = [];
        foreach ($decoded as $tag) {
            $tag = trim(Str::lower((string) $tag));
            if ($tag !== '') {
                $tags[] = $tag;
            }
        }
        return array_values(array_unique($tags));
    }

}
