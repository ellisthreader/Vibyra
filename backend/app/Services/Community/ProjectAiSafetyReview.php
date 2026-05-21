<?php

namespace App\Services\Community;

use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class ProjectAiSafetyReview
{
    public function review(array $input): ?array
    {
        $config = (array) config('moderation.publish_ai_review', []);
        if (! (bool) ($config['enabled'] ?? false) || ! config('services.openrouter.key')) {
            return null;
        }

        $score = (int) ($input['score'] ?? 0);
        if ($score < (int) ($config['min_score'] ?? 35) || $score > (int) ($config['max_score'] ?? 74)) {
            return null;
        }

        $findings = (array) ($input['findings'] ?? []);
        if ($this->hasFinding($findings, 'source_snapshot_missing')) {
            return null;
        }
        if ($this->tooLargeForAi((array) ($input['sourceFiles'] ?? []), $config)) {
            return null;
        }

        $messages = $this->messages($input, (int) ($config['max_input_characters'] ?? 9000));
        if ($messages === []) {
            return null;
        }

        try {
            $response = Http::withToken((string) config('services.openrouter.key'))
                ->timeout((int) ($config['timeout_seconds'] ?? 20))
                ->post((string) config('services.openrouter.url'), [
                    'model' => (string) ($config['model'] ?? 'openai/gpt-5.4-nano'),
                    'messages' => $messages,
                    'max_completion_tokens' => (int) ($config['max_output_tokens'] ?? 350),
                    'temperature' => 0,
                    'usage' => ['include' => true],
                ]);
        } catch (\Throwable) {
            return null;
        }

        if (! $response->successful()) {
            return null;
        }

        return $this->parseDecision($this->completionText($response->json()));
    }

    private function messages(array $input, int $maxCharacters): array
    {
        $payload = [
            'listing' => [
                'title' => Str::limit((string) ($input['title'] ?? ''), 120, ''),
                'description' => Str::limit((string) ($input['description'] ?? ''), 500, ''),
                'stack' => Str::limit((string) ($input['stack'] ?? ''), 80, ''),
                'tags' => array_slice((array) ($input['tags'] ?? []), 0, 10),
            ],
            'deterministicScore' => (int) ($input['score'] ?? 0),
            'findings' => array_map(fn ($finding) => Arr::only((array) $finding, [
                'code', 'severity', 'target', 'message', 'path', 'scoreImpact',
            ]), array_slice((array) ($input['findings'] ?? []), 0, 18)),
            'sourceSnippets' => $this->sourceSnippets((array) ($input['sourceFiles'] ?? []), (array) ($input['findings'] ?? [])),
        ];

        $json = Str::limit(json_encode($payload, JSON_UNESCAPED_SLASHES) ?: '', $maxCharacters, '');
        if ($json === '') {
            return [];
        }

        return [
            [
                'role' => 'system',
                'content' => 'You are Vibyra publish safety review. Classify whether a public project can be auto-approved. Never approve secrets, credential files, malware, exfiltration, adult/violent/hate content, phishing, or unclear source snapshots. Return only compact JSON: {"decision":"approve|deny|review","confidence":0-1,"score":0-100,"summary":"short user-safe reason"}.',
            ],
            [
                'role' => 'user',
                'content' => $json,
            ],
        ];
    }

    private function tooLargeForAi(array $files, array $config): bool
    {
        $maxFiles = (int) ($config['max_source_files'] ?? 24);
        if (count($files) > $maxFiles) {
            return true;
        }

        $maxCharacters = (int) ($config['max_source_characters'] ?? 120000);
        $characters = 0;
        foreach ($files as $file) {
            if (! is_array($file)) {
                continue;
            }
            $characters += mb_strlen((string) ($file['body'] ?? ''));
            if ($characters > $maxCharacters) {
                return true;
            }
        }

        return false;
    }

    private function sourceSnippets(array $files, array $findings): array
    {
        $paths = array_values(array_unique(array_filter(array_map(
            fn ($finding) => is_array($finding) ? (string) ($finding['path'] ?? '') : '',
            $findings
        ))));

        $selected = [];
        foreach ($files as $file) {
            if (! is_array($file)) {
                continue;
            }
            $path = (string) ($file['path'] ?? '');
            $important = $paths === [] || in_array($path, $paths, true) || preg_match('/(^|\/)(package\.json|index\.html|app\.(?:js|ts|tsx)|main\.(?:js|ts|tsx))$/i', $path);
            if (! $important) {
                continue;
            }
            $selected[] = [
                'path' => Str::limit($path, 180, ''),
                'language' => Str::limit((string) ($file['language'] ?? ''), 40, ''),
                'body' => Str::limit((string) ($file['body'] ?? ''), 1000, ''),
            ];
            if (count($selected) >= 8) {
                break;
            }
        }

        return $selected;
    }

    private function parseDecision(string $text): ?array
    {
        $json = $this->extractJson($text);
        if ($json === '') {
            return null;
        }

        $decoded = json_decode($json, true);
        if (! is_array($decoded)) {
            return null;
        }

        $decision = strtolower((string) ($decoded['decision'] ?? ''));
        if (! in_array($decision, ['approve', 'deny', 'review'], true)) {
            return null;
        }

        return [
            'decision' => $decision,
            'confidence' => max(0, min(1, (float) ($decoded['confidence'] ?? 0))),
            'score' => max(0, min(100, (int) ($decoded['score'] ?? 0))),
            'summary' => Str::limit(trim((string) ($decoded['summary'] ?? 'AI safety review completed.')), 220, ''),
        ];
    }

    private function extractJson(string $text): string
    {
        $text = trim($text);
        if (str_starts_with($text, '{') && str_ends_with($text, '}')) {
            return $text;
        }
        if (preg_match('/\{.*\}/s', $text, $match) === 1) {
            return $match[0];
        }

        return '';
    }

    private function completionText(array $decoded): string
    {
        $content = $decoded['choices'][0]['message']['content'] ?? $decoded['choices'][0]['text'] ?? '';
        if (is_string($content)) {
            return $content;
        }
        if (is_array($content)) {
            return collect($content)->map(fn ($part) => is_array($part) ? (string) ($part['text'] ?? $part['content'] ?? '') : (string) $part)->implode('');
        }

        return '';
    }

    private function hasFinding(array $findings, string $code): bool
    {
        foreach ($findings as $finding) {
            if (is_array($finding) && ($finding['code'] ?? '') === $code) {
                return true;
            }
        }

        return false;
    }
}
