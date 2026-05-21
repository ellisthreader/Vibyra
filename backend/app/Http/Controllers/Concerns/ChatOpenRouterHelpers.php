<?php

namespace App\Http\Controllers\Concerns;

use App\Services\Billing\CreditCalculator;
use Illuminate\Http\Request;

trait ChatOpenRouterHelpers
{
    private function resolveSkill(string $id): ?array
    {
        foreach ((array) config('skills.list', []) as $skill) {
            if (($skill['id'] ?? null) === $id) {
                return $skill;
            }
        }
        return null;
    }

    private function effectiveChatModelKey(string $modelKey, ?array $skill): string
    {
        $skillModelKey = trim((string) ($skill['model_key'] ?? ''));
        return $skillModelKey !== '' ? $skillModelKey : $modelKey;
    }

    private function requestedToolOnlyModelWithoutMatchingSkill(string $modelKey, ?array $skill, CreditCalculator $calc): bool
    {
        $config = $calc->modelConfig($modelKey);
        if (! (bool) ($config['tool_only'] ?? false)) {
            return false;
        }

        return trim((string) ($skill['model_key'] ?? '')) !== $modelKey;
    }

    private function normalizeReasoningEffort(string $value): string
    {
        $value = strtolower(trim($value));
        return in_array($value, ['none', 'low', 'medium', 'high', 'xhigh'], true) ? $value : 'medium';
    }

    private function buildReasoningPayload(string $effort, int $maxOutputTokens, string $openRouterModel): ?array
    {
        if ($openRouterModel === 'openai/o3-deep-research') {
            return ['effort' => 'medium'];
        }
        if ($openRouterModel === 'google/gemini-2.5-flash-lite') {
            return ['exclude' => true];
        }
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

    private function openRouterChatPayload(
        string $openRouterModel,
        array $messages,
        int $maxOutputTokens,
        ?array $reasoningPayload,
        ?array $skill,
        bool $stream = false
    ): array {
        $payload = [
            'model' => $openRouterModel,
            'messages' => $messages,
            'max_completion_tokens' => $maxOutputTokens,
            'usage' => ['include' => true],
        ];
        if ($stream) {
            $payload['stream'] = true;
        }
        if ($this->openRouterModelSupportsTemperature($openRouterModel)) {
            $payload['temperature'] = 0.25;
        }
        if ($reasoningPayload !== null) {
            $payload['reasoning'] = $reasoningPayload;
        }
        $webSearchTools = $this->webSearchTools($skill);
        if ($webSearchTools !== []) {
            $payload['tools'] = $webSearchTools;
        }

        return $payload;
    }

    private function openRouterModelSupportsTemperature(string $openRouterModel): bool
    {
        return ! in_array($openRouterModel, [
            'openai/o3-deep-research',
        ], true);
    }

    private function resolveMaxTokens(Request $request, string $prompt, ?array $skill): int
    {
        if ($this->resolveChatMode($request, $prompt, $skill) === 'build') {
            return 3000;
        }
        if ($this->isDeepResearchModelKey((string) ($skill['model_key'] ?? $request->input('model', '')))) {
            $skillTokens = (int) ($skill['max_tokens'] ?? 0);
            return max(8000, min($skillTokens > 0 ? $skillTokens : 16000, 16000));
        }
        $skillTokens = (int) ($skill['max_tokens'] ?? 0);
        if ($skillTokens > 0) {
            return max(800, min($skillTokens, 3000));
        }
        return 800;
    }

    private function webSearchTools(?array $skill): array
    {
        if (! (bool) ($skill['web_plugin'] ?? false)) {
            return [];
        }

        return [[
            'type' => 'openrouter:web_search',
            'parameters' => [
                'engine' => 'auto',
                'max_results' => 5,
                'max_total_results' => 10,
                'search_context_size' => 'medium',
            ],
        ]];
    }

    private function isDeepResearchModelKey(string $modelKey): bool
    {
        return $modelKey === 'tool-deep-research';
    }

    private function isDeepResearchOpenRouterModel(string $openRouterModel): bool
    {
        return $openRouterModel === 'openai/o3-deep-research';
    }

    private function openRouterHttpTimeout(string $openRouterModel, string $modelKey = ''): int
    {
        if ($this->isDeepResearchModelKey($modelKey)) {
            return 900;
        }
        return $this->isDeepResearchOpenRouterModel($openRouterModel) || $openRouterModel === 'google/gemini-2.5-flash-lite' ? 180 : 90;
    }

    private function openRouterEmptyCompletionRetryPayload(array $payload): ?array
    {
        if (! in_array((string) ($payload['model'] ?? ''), [
            'openai/o3-deep-research',
            'google/gemini-2.5-flash-lite',
        ], true)) {
            return null;
        }

        $retry = $payload;
        $retry['max_completion_tokens'] = max(8000, (int) ($payload['max_completion_tokens'] ?? 0));
        $retry['messages'][] = [
            'role' => 'system',
            'content' => 'The previous Deep Research attempt returned no final answer. Produce a concise final answer in plain text now. If research is incomplete, say what was confirmed and what remains uncertain.',
        ];

        return $retry;
    }

    private function openRouterCompletionContent(array $decoded): string
    {
        $choice = $decoded["choices"][0] ?? null;
        if (is_array($choice)) {
            $messageContent = $this->openRouterContentText($choice["message"]["content"] ?? null);
            if ($messageContent !== "") {
                return $messageContent;
            }

            $textContent = $this->openRouterContentText($choice["text"] ?? null);
            if ($textContent !== "") {
                return $textContent;
            }
        }

        $outputText = $this->openRouterContentText($decoded["output_text"] ?? null);
        if ($outputText !== "") {
            return $outputText;
        }

        $text = "";
        foreach (($decoded["output"] ?? []) as $output) {
            if (! is_array($output)) {
                continue;
            }
            $text .= $this->openRouterContentText($output["content"] ?? null);
        }

        return $text;
    }

    private function openRouterStreamContent(array $decoded): string
    {
        $choice = $decoded["choices"][0] ?? null;
        if (! is_array($choice)) {
            return "";
        }

        $deltaContent = $this->openRouterContentText($choice["delta"]["content"] ?? null);
        if ($deltaContent !== "") {
            return $deltaContent;
        }

        return $this->openRouterContentText($choice["message"]["content"] ?? null);
    }

    private function openRouterContentText(mixed $content): string
    {
        if (is_string($content)) {
            return $content;
        }
        if (! is_array($content)) {
            return "";
        }
        if (isset($content["text"]) || isset($content["content"])) {
            return (string) ($content["text"] ?? $content["content"] ?? "");
        }

        $text = "";
        foreach ($content as $part) {
            if (is_string($part)) {
                $text .= $part;
                continue;
            }
            if (is_array($part)) {
                $text .= $this->openRouterContentText($part);
            }
        }

        return $text;
    }

}
