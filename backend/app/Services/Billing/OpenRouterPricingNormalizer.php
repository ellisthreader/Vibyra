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
            // Clamped here rather than on the phone: a timestamp in the future would
            // otherwise satisfy "released recently" forever and badge a model New for good.
            'created' => is_int($model['created'] ?? null) && $model['created'] > 0
                && $model['created'] <= time() + 86400 ? $model['created'] : null,
            'context_length' => $this->positiveInt($model['context_length'] ?? null)
                ?? $this->positiveInt(($model['top_provider'] ?? [])['context_length'] ?? null),
            'output_modalities' => $this->modalities($model['architecture'] ?? null),
            'reasoning' => $this->reasoning($model['reasoning'] ?? null),
        ];
    }

    /**
     * The model's reasoning ladder, kept only when the provider actually publishes
     * one. A missing `supported_efforts` key and an explicit null are different
     * facts - "no levels, only a switch" versus "every level" - so the absent key
     * is preserved as an absent key rather than flattened into an empty list.
     */
    private function reasoning(mixed $reasoning): ?array
    {
        if (! is_array($reasoning)) {
            return null;
        }

        $normalized = ['mandatory' => ($reasoning['mandatory'] ?? null) === true];
        if (array_key_exists('supported_efforts', $reasoning)) {
            $efforts = $reasoning['supported_efforts'];
            $normalized['supported_efforts'] = $efforts === null ? null : $this->efforts($efforts);
        }
        $default = $reasoning['default_effort'] ?? null;
        if (is_string($default) && in_array($default, self::EFFORTS, true)) {
            $normalized['default_effort'] = $default;
        }

        return $normalized;
    }

    /** OpenRouter's effort vocabulary. Anything outside it is not forwardable. */
    public const EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

    private function efforts(mixed $efforts): array
    {
        if (! is_array($efforts)) {
            return [];
        }

        $normalized = [];
        foreach ($efforts as $effort) {
            if (is_string($effort) && in_array($effort, self::EFFORTS, true)) {
                $normalized[] = $effort;
            }
        }

        // Ascending, so every reader sees one cheapest-to-deepest order.
        return array_values(array_intersect(self::EFFORTS, array_unique($normalized)));
    }

    private function modalities(mixed $architecture): ?array
    {
        $output = is_array($architecture) ? ($architecture['output_modalities'] ?? null) : null;
        if (! is_array($output)) {
            return null;
        }

        $normalized = [];
        foreach ($output as $modality) {
            if (is_string($modality) && trim($modality) !== '' && strlen($modality) <= 32) {
                $normalized[] = strtolower(trim($modality));
            }
        }

        return array_values(array_unique($normalized));
    }

    private function positiveInt(mixed $value): ?int
    {
        return is_int($value) && $value > 0 ? $value : null;
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
