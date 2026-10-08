<?php

namespace App\Services\ModelCatalog;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/** Check provider-side caps before any paid automation; never reuse the user-inference key. */
final class AutomationKeys
{
    public function verify(string $kind): void
    {
        $image = $kind === 'artwork';
        $key = (string) config('model_catalog.'.($image ? 'image_key' : 'probe_key'));
        $other = (string) config('model_catalog.'.($image ? 'probe_key' : 'image_key'));
        if (! $key || $key === $other || $key === (string) config('services.openrouter.key')) {
            throw new RuntimeException('Dedicated model catalog keys are required.');
        }
        $response = Http::withToken($key)->timeout(10)->withOptions(['allow_redirects' => false])
            ->get('https://openrouter.ai/api/v1/key');
        $data = $response->json('data');
        $cap = min($image ? 2 : 5, config('model_catalog.'.($image ? 'artwork' : 'probe').'_daily_micro') / 1000000);
        if (! $response->successful() || ! is_array($data) || ! is_numeric($data['limit'] ?? null)
            || (float) $data['limit'] <= 0 || (float) $data['limit'] > $cap
            || ($data['limit_reset'] ?? null) !== 'daily' || ($data['include_byok_in_limit'] ?? null) !== true
            || ($data['is_management_key'] ?? false) || ($data['is_provisioning_key'] ?? false)) {
            throw new RuntimeException('Model catalog key must have the agreed daily cap, including BYOK.');
        }
    }
}
