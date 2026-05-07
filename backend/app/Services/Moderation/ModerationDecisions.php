<?php

namespace App\Services\Moderation;

use Illuminate\Http\Exceptions\HttpResponseException;

trait ModerationDecisions
{
    protected function enabled(): bool
    {
        return (bool) config('moderation.enabled', true);
    }

    protected function allowedDecision(string $surface, ?string $warning = null): array
    {
        return [
            'allowed' => true,
            'surface' => $surface,
            'categories' => [],
            'warning' => $warning,
        ];
    }

    protected function blockedDecision(string $surface, string $category, string $reason, ?string $message = null): array
    {
        return [
            'allowed' => false,
            'surface' => $surface,
            'categories' => array_values(array_filter(array_map('trim', explode(',', $category)))),
            'reason' => $reason,
            'message' => $message ?: (string) config('moderation.block_message'),
        ];
    }

    protected function assertDecisionAllowed(array $decision): void
    {
        if ($decision['allowed'] ?? false) {
            return;
        }

        throw new HttpResponseException(response()->json([
            'ok' => false,
            'error' => $decision['message'] ?? config('moderation.block_message'),
            'moderation' => [
                'blocked' => true,
                'surface' => $decision['surface'] ?? 'user input',
                'categories' => $decision['categories'] ?? [],
                'reason' => $decision['reason'] ?? 'blocked',
            ],
        ], 422));
    }
}
