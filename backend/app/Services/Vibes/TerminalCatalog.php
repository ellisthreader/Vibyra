<?php

namespace App\Services\Vibes;

use App\Services\Billing\OpenRouterPricingCatalog;

/** A separate manual catalogue: widening it must never change Auto's policy. */
final class TerminalCatalog
{
    public function __construct(private OpenRouterPricingCatalog $pricing) {}

    public function page(int $page, ?string $revision = null): array
    {
        if ($this->pricing->isStale()) $this->pricing->refreshPricingFor(config('vibes.auto_model'));
        $snapshot = $this->pricing->snapshot();
        $version = hash('sha256', json_encode($snapshot));
        abort_if($revision !== null && $revision !== $version, 409, 'The model list changed. Refresh it to continue.');
        $fresh = ! $this->pricing->isStale();
        $rows = collect($snapshot['models'] ?? [])->filter(fn ($m, $id) => self::executable($id) && in_array('text', $m['output_modalities'] ?? [], true))
            ->sortKeys()->map(fn ($m, $id) => $this->row($id, $m, $fresh))->values();
        return ['version' => 1, 'source' => 'vibyra', 'revision' => $version,
            'models' => $rows->slice(($page - 1) * 100, 100)->values()->all(),
            'next' => $page * 100 < $rows->count() ? $page + 1 : null];
    }

    public function resolve(string $id): array
    {
        abort_unless(self::executable($id), 422, 'Choose Vibyra Auto or a specific chat or code model.');
        $price = $this->pricing->refreshPricingFor($id);
        $m = $this->pricing->all()[$id] ?? null;
        abort_unless($m && in_array('text', $m['output_modalities'] ?? [], true), 422, 'Choose a chat or code model.');
        abort_unless($price && ! $this->pricing->isStale(), 503, 'This model is temporarily unavailable. Refresh the model list.');
        return $this->row($id, $m, true);
    }

    /** Validate a bounded Auto menu against one authoritative pricing snapshot. */
    public function candidates(array $ids): array
    {
        if ($this->pricing->isStale()) $this->pricing->refreshPricingFor(config('vibes.auto_model'));
        abort_if($this->pricing->isStale(), 503, 'Model pricing is being refreshed. Try again shortly.');
        $snapshot = $this->pricing->all();
        $rows = [];
        foreach ($ids as $id) {
            $model = $snapshot[$id] ?? null;
            if (!self::executable($id) || !$model || !in_array('text', $model['output_modalities'] ?? [], true)
                || !isset($model['pricing']['prompt'], $model['pricing']['completion'])) continue;
            $row = $this->row($id, $model, true);
            $rows[] = ['id' => $id, 'name' => config('vibes.models')[$id]['name'] ?? $row['name'], 'efforts' => $row['efforts']];
        }

        return $rows;
    }

    public static function executable(string $id): bool
    {
        return ! preg_match('~^(?:typesafe/jev(?:[-/]|$)|openrouter/(?:auto|free|bodybuilder)(?:$|:))~i', ltrim($id, '~'));
    }

    private function row(string $id, array $m, bool $fresh): array
    {
        $available = $fresh && isset($m['pricing']['prompt'], $m['pricing']['completion']);
        $efforts = Catalog::supportedEfforts($m['reasoning'] ?? null);
        $defaultEffort = $m['reasoning']['default_effort'] ?? null;
        return ['id' => $id, 'name' => $m['name'] ?? $id, 'family' => explode('/', $id)[0],
            'created' => $m['created'] ?? null,
            'efforts' => $efforts, 'defaultEffort' => in_array($defaultEffort, $efforts, true) ? $defaultEffort : null,
            'source' => 'vibyra', 'available' => $available, 'trial' => false,
            'unavailableReason' => $available ? null : 'Pricing is being refreshed. Try again shortly.',
            'tools' => in_array('tools', $m['supported_parameters'] ?? [], true),
            'inputModalities' => $m['input_modalities'] ?? ['text'], 'outputModalities' => $m['output_modalities'] ?? ['text'],
            'inputPerMillion' => $available ? (float) $m['pricing']['prompt'] * 1000000 : null,
            'outputPerMillion' => $available ? (float) $m['pricing']['completion'] * 1000000 : null];
    }
}
