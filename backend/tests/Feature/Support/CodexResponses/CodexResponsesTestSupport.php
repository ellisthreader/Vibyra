<?php

namespace Tests\Feature\Support\CodexResponses;

use App\Models\User;
use Illuminate\Support\Facades\Cache;

trait CodexResponsesTestSupport
{
    private function codexUserToken(string $email): string
    {
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Codex User',
            'email' => $email,
            'password' => 'secret123',
        ])->json('token');
        User::where('email', $email)->update([
            'plan' => 'starter',
            'credits_balance' => 500,
        ]);

        return $token;
    }

    private function setTerminalModelCapabilities(array $models): void
    {
        $catalog = [];
        foreach ($models as $slug => $model) {
            $configured = array_key_exists('supported_parameters', $model);
            $catalog[$slug] = [
                'pricing' => $configured ? ($model['pricing'] ?? []) : [],
                'supported_parameters' => $configured ? $model['supported_parameters'] : $model,
            ];
        }

        Cache::put(
            (string) config('billing.openrouter_pricing.cache_key', 'billing:openrouter-pricing:v1'),
            [
                'synced_at' => now()->toIso8601String(),
                'models' => $catalog,
            ],
            now()->addHour(),
        );
    }
}
