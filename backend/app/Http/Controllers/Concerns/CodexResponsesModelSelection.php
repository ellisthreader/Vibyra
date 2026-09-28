<?php

namespace App\Http\Controllers\Concerns;

use App\Services\AutoModelRouter;
use App\Services\Billing\CreditCalculator;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

trait CodexResponsesModelSelection
{
    private function codexResponseModel(string $requested, array $payload, int $userId, string $plan, CreditCalculator $calc): ?string
        {
            if ($requested !== 'auto') {
                return $calc->modelConfig($requested) ? $requested : null;
            }
            $thread = preg_replace('/[^a-zA-Z0-9._-]/', '', (string) ($payload['prompt_cache_key'] ?? ''));
            $cacheKey = 'codex:auto:'.$userId.':'.($thread ?: hash('sha256', json_encode($payload['input'])));
            $modelKey = Cache::remember($cacheKey, now()->addHours(6), function () use ($payload, $plan, $calc) {
                return app(AutoModelRouter::class)->route($this->codexUserPrompt($payload['input']), $plan, $calc)['modelKey'];
            });
            return is_string($modelKey) && $modelKey !== 'auto' && $calc->modelConfig($modelKey)
                ? $modelKey
                : null;
        }
    private function codexUserPrompt(mixed $input): string
        {
            $text = '';
            foreach (is_array($input) ? $input : [$input] as $item) {
                if (is_string($item)) {
                    $text = $item;
                }
                if (! is_array($item) || ($item['role'] ?? '') !== 'user') {
                    continue;
                }
                foreach (is_array($item['content'] ?? null) ? $item['content'] : [] as $content) {
                    if (is_array($content) && isset($content['text'])) {
                        $text = (string) $content['text'];
                    }
                }
            }
            return Str::limit(trim($text) ?: 'General coding task', 8000, '');
        }
    private function codexRequestCostMultiplier(array $payload): float
        {
            $multiplier = 1.0;
            if (($payload['service_tier'] ?? null) === 'priority') {
                $multiplier = max(
                    $multiplier,
                    (float) config(
                        'billing.openrouter_pricing.request_cost_multipliers.priority_service_tier',
                        3.0
                    )
                );
            }
            if (($payload['speed'] ?? null) === 'fast') {
                $multiplier = max(
                    $multiplier,
                    (float) config(
                        'billing.openrouter_pricing.request_cost_multipliers.fast_speed',
                        6.0
                    )
                );
            }
            return $multiplier;
        }
}
