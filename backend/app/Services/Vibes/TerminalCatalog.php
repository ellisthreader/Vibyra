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
        $rows = collect($snapshot['models'] ?? [])->filter(fn ($m) => in_array('text', $m['output_modalities'] ?? [], true))
            ->sortKeys()->map(fn ($m, $id) => $this->row($id, $m, $fresh))->values();
        return ['version' => 1, 'source' => 'vibyra', 'revision' => $version,
            'models' => $rows->slice(($page - 1) * 100, 100)->values()->all(),
            'next' => $page * 100 < $rows->count() ? $page + 1 : null];
    }

    public function resolve(string $id): array
    {
        $price = $this->pricing->refreshPricingFor($id);
        $m = $this->pricing->all()[$id] ?? null;
        abort_unless($m && in_array('text', $m['output_modalities'] ?? [], true), 422, 'Choose a chat or code model.');
        abort_unless($price && ! $this->pricing->isStale(), 503, 'This model is temporarily unavailable. Refresh the model list.');
        return $this->row($id, $m, true);
    }

    private function row(string $id, array $m, bool $fresh): array
    {
        $available = $fresh && isset($m['pricing']['prompt'], $m['pricing']['completion']);
        return ['id' => $id, 'name' => $m['name'] ?? $id, 'family' => explode('/', $id)[0],
            'source' => 'vibyra', 'available' => $available, 'trial' => false,
            'unavailableReason' => $available ? null : 'Pricing is being refreshed. Try again shortly.',
            'tools' => in_array('tools', $m['supported_parameters'] ?? [], true),
            'inputModalities' => $m['input_modalities'] ?? ['text'], 'outputModalities' => $m['output_modalities'] ?? ['text'],
            'inputPerMillion' => $available ? (float) $m['pricing']['prompt'] * 1000000 : null,
            'outputPerMillion' => $available ? (float) $m['pricing']['completion'] * 1000000 : null];
    }
}
