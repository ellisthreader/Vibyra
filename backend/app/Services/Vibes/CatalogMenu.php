<?php

namespace App\Services\Vibes;

/** Render one consistent pricing snapshot; never read the database cache once per row. */
final class CatalogMenu
{
    public function __construct(private Catalog $catalog, private array $snapshot, private bool $fresh) {}

    public function models(): array
    {
        $curated = collect(config('vibes.models'))->map(fn ($entry, $id) => $this->row($id, $entry))->values();
        $extra = collect($this->snapshot)->except($curated->pluck('id')->all())
            ->reject(fn ($model, $id) => $this->catalog->hidden($id, $model, $this->snapshot))
            ->map(fn ($model, $id) => $this->row($id, [
                'family' => ucfirst(str_replace('-', ' ', explode('/', $id, 2)[0])),
                'name' => $this->name($model, $id), 'trial' => false,
            ]))
            ->filter(fn ($row) => $row['available'])->sortBy([['family', 'asc'], ['name', 'asc']])
            ->take(max(0, (int) config('vibes.catalogue_limit') - $curated->count()))->values();

        return $curated->concat($extra)->all();
    }

    private function row(string $id, array $entry): array
    {
        $model = $this->snapshot[$id] ?? [];
        $price = $model['pricing'] ?? [];
        $known = $this->fresh && isset($price['prompt'], $price['completion']);
        $reasoning = is_array($model['reasoning'] ?? null) ? $model['reasoning'] : null;
        $efforts = Catalog::supportedEfforts($reasoning);
        $default = $reasoning['default_effort'] ?? null;
        $entry['trial'] = $this->catalog->includedFree($id, $price);

        return ['id' => $id, ...$entry, 'available' => $known,
            'inputPerMillion' => $known ? (float) $price['prompt'] * 1000000 : null,
            'outputPerMillion' => $known ? (float) $price['completion'] * 1000000 : null,
            'reasoning' => ['efforts' => $efforts,
                'defaultEffort' => is_string($default) && in_array($default, $efforts, true) ? $default : null,
                'mandatory' => (bool) ($reasoning['mandatory'] ?? false)],
            'vision' => in_array('image', (array) ($model['input_modalities'] ?? []), true),
            'created' => $model['created'] ?? null];
    }

    private function name(mixed $model, string $id): string
    {
        $name = is_array($model) && is_string($model['name'] ?? null) ? trim($model['name']) : '';
        if ($name === '') $name = str_contains($id, '/') ? explode('/', $id, 2)[1] : $id;
        return str_contains($name, ': ') ? trim(explode(': ', $name, 2)[1]) : $name;
    }
}
