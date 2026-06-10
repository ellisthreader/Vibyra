<?php

namespace App\Services\Billing;

use Illuminate\Http\Client\Response;

class OpenRouterPricingNormalizer
{
    public function fromResponse(Response $response): ?array
    {
        if (! $response->successful()) {
            return null;
        }

        $data = $response->json('data');
        if (! is_array($data)) {
            return null;
        }

        $models = [];
        foreach ($data as $model) {
            $normalized = $this->normalizeModel($model);
            if ($normalized !== null) {
                $models[$normalized['slug']] = $normalized;
            }
        }
        ksort($models);

        return $models === [] ? null : $models;
    }

    private function normalizeModel(mixed $model): ?array
    {
        if (! is_array($model) || ! $this->validSlug($model['id'] ?? null)) {
            return null;
        }
        $pricing = $model['pricing'] ?? null;
        if (! is_array($pricing)) {
            return null;
        }

        $normalizedPricing = [];
        foreach ($pricing as $unit => $price) {
            if (is_string($unit) && $this->validPrice($price)) {
                $normalizedPricing[$unit] = $price;
            }
        }
        if ($normalizedPricing === []) {
            return null;
        }

        ksort($normalizedPricing);
        $slug = trim($model['id']);
        $supportedParameters = $this->supportedParameters($model['supported_parameters'] ?? null);

        return [
            'slug' => $slug,
            'canonical_slug' => $this->validSlug($model['canonical_slug'] ?? null)
                ? trim($model['canonical_slug'])
                : $slug,
            'name' => is_string($model['name'] ?? null) ? trim($model['name']) : $slug,
            'pricing' => $normalizedPricing,
            'supported_parameters' => $supportedParameters,
        ];
    }

    private function supportedParameters(mixed $parameters): array
    {
        if (! is_array($parameters)) {
            return [];
        }

        $normalized = [];
        foreach ($parameters as $parameter) {
            if (! is_string($parameter) || trim($parameter) === '') {
                continue;
            }
            $normalized[] = strtolower(trim($parameter));
        }

        $normalized = array_values(array_unique($normalized));
        sort($normalized);

        return $normalized;
    }

    private function validSlug(mixed $slug): bool
    {
        return is_string($slug)
            && strlen(trim($slug)) <= 255
            && str_contains(trim($slug), '/')
            && preg_match('/^[^\s\x00-\x1F\x7F]+$/', trim($slug)) === 1;
    }

    private function validPrice(mixed $price): bool
    {
        return is_string($price)
            && preg_match('/^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/', $price) === 1;
    }
}
