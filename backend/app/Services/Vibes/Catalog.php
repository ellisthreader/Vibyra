<?php

namespace App\Services\Vibes;

use App\Services\Billing\OpenRouterPricingCatalog;

class Catalog
{
    public function __construct(private readonly OpenRouterPricingCatalog $pricing, private readonly Plans $plans) {}

    /**
     * Curated models for every account. Full-catalogue plans additionally receive
     * every priced model in the live OpenRouter snapshot, so the offer is the real
     * provider catalogue rather than a longer hardcoded list.
     */
    public function models(string $plan = 'free'): array
    {
        if ($this->pricing->isStale()) $this->pricing->refreshPricingFor(config('vibes.auto_model'));
        $curated = collect(config('vibes.models'))->map(fn ($entry, $id) => $this->row($id, $entry))->values();
        if (! $this->plans->for($plan)['fullCatalogue']) return $curated->all();

        $extra = collect($this->pricing->all())
            ->except($curated->pluck('id')->all())
            ->map(fn ($model, $id) => $this->row($id, [
                'family' => $this->family($id), 'name' => $this->name($model, $id), 'trial' => false,
            ]))
            ->filter(fn ($row) => $row['available'])
            ->sortBy([['family', 'asc'], ['name', 'asc']])
            ->take(max(0, (int) config('vibes.catalogue_limit') - $curated->count()))
            ->values();

        return $curated->concat($extra)->all();
    }

    public function resolve(string $id, string $plan = 'free'): array
    {
        if ($id === 'auto') $id = config('vibes.auto_model');
        $entry = config('vibes.models')[$id] ?? null;
        if (! $entry && $this->plans->for($plan)['fullCatalogue'] && isset($this->pricing->all()[$id])) {
            // Catalogue models are never trial-funded; they can only be paid for
            // with purchased Vibes, exactly like the curated non-trial models.
            $entry = ['family' => $this->family($id), 'name' => $this->name($this->pricing->all()[$id], $id), 'trial' => false];
        }
        abort_unless($entry, 422, 'Choose a supported model.');
        $price = $this->pricing->refreshPricingFor($id);
        abort_unless(is_array($price) && isset($price['prompt'], $price['completion']), 503, 'This model is temporarily unavailable.');
        return ['id' => $id, ...$entry, 'pricing' => $price, 'tools' => $this->pricing->supportsTerminalToolCalling($id)];
    }

    private function row(string $id, array $entry): array
    {
        $price = $this->pricing->freshPricingFor($id);
        $known = is_array($price) && isset($price['prompt'], $price['completion']);
        return ['id' => $id, ...$entry, 'available' => $known,
            'inputPerMillion' => $known ? (float) $price['prompt'] * 1000000 : null,
            'outputPerMillion' => $known ? (float) $price['completion'] * 1000000 : null];
    }

    /** Provider prefix of an OpenRouter slug, shown as the model's family. */
    private function family(string $id): string
    {
        $vendor = str_contains($id, '/') ? explode('/', $id, 2)[0] : $id;
        return ucfirst(str_replace('-', ' ', $vendor));
    }

    private function name(mixed $model, string $id): string
    {
        $name = is_array($model) && is_string($model['name'] ?? null) ? trim($model['name']) : '';
        if ($name === '') $name = str_contains($id, '/') ? explode('/', $id, 2)[1] : $id;
        // OpenRouter names are "Vendor: Model"; the family column already carries the vendor.
        return str_contains($name, ': ') ? trim(explode(': ', $name, 2)[1]) : $name;
    }
}
