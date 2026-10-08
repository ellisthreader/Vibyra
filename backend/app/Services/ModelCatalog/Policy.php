<?php

namespace App\Services\ModelCatalog;

use App\Services\Vibes\Catalog;

/** Deterministic eligibility; names and descriptions never become instructions. */
final class Policy
{
    public static function normalize(array $m): ?array
    {
        $id = $m['slug'] ?? '';
        if (! is_string($id) || strlen($id) > 160
            || ! preg_match('~^[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._-]*$~', $id)) return null;
        [$provider, $slug] = explode('/', $id, 2);
        $family = config('model_catalog.families.'.$provider);
        if (! $family || ! preg_match($family, $slug)) return null;
        if (preg_match('/(?:^|[-.])(mini|nano|oss|image|audio|embedding|latest|experimental|preview|exp|batch)(?:$|[-.])/', $slug)) return null;
        if ($provider === 'openai' && str_ends_with($slug, '-pro')) return null;
        if (($m['output_modalities'] ?? []) !== ['text'] || ! in_array('tools', $m['supported_parameters'] ?? [], true)) return null;
        $price = $m['pricing'] ?? [];
        foreach (['prompt', 'completion'] as $key) {
            if (! isset($price[$key]) || ! is_numeric($price[$key]) || ! is_finite((float) $price[$key])
                || (float) $price[$key] < 0 || (float) $price[$key] > 0.01) return null;
        }
        // Extra charge dimensions need a dedicated cost adapter before probing.
        foreach ($price as $key => $value) {
            if (! in_array($key, ['prompt', 'completion', 'input_cache_read', 'input_cache_write'], true)
                && (float) $value !== 0.0) return null;
        }
        $reasoning = $m['reasoning'] ?? null;
        $efforts = Catalog::supportedEfforts($reasoning);
        $created = $m['created'] ?? null;
        return ['id' => $id, 'name' => mb_substr($m['name'] ?? $id, 0, 120), 'provider' => $provider,
            'created' => is_int($created) && $created <= time() ? $created : null,
            'contextLength' => $m['context_length'] ?? 0, 'pricing' => $price,
            'efforts' => $efforts, 'reasoning' => $reasoning,
            'defaultEffort' => in_array($reasoning['default_effort'] ?? null, $efforts, true) ? $reasoning['default_effort'] : null,
            'vision' => in_array('image', $m['input_modalities'] ?? [], true),
            'terminal' => count(array_diff($efforts, ['none'])) >= 2,
            // Discovery can never opt a model into Auto or grant native account access.
            'auto' => false, 'route' => 'openrouter'];
    }
}
