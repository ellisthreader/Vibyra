<?php

namespace App\Services\Vibes;

use App\Services\Billing\OpenRouterPricingCatalog;
use App\Services\Billing\OpenRouterPricingNormalizer;

class Catalog
{
    public function __construct(private readonly OpenRouterPricingCatalog $pricing, private readonly Plans $plans) {}

    /**
     * Every company OpenRouter serves, on every plan. The curated models lead
     * because they carry a tier and a written blurb; the rest of the live snapshot
     * follows once the variants nobody wants in a consumer picker are removed.
     * The catalogue is a menu, not an entitlement: what a plan changes is which
     * models trial credit can pay for, never which ones can be seen.
     */
    public function models(string $plan = 'free'): array
    {
        if ($this->pricing->isStale()) $this->pricing->refreshPricingFor(config('vibes.auto_model'));
        return (new CatalogMenu($this, $this->pricing->all(), ! $this->pricing->isStale()))->models();
    }

    /**
     * Companies whose models are not what Vibyra is for, kept in step with the
     * phone's own `UNLISTED` list in `mobile/src/ui/modelGroups.ts`. The phone
     * filters too, so an older backend cannot put them back on someone's screen.
     */
    private const UNLISTED = ['baidu', 'upstage', 'stepfun', 'ibm-granite', 'inception'];

    /**
     * Variants that are duplicates rather than choices. Every rule here removes a
     * row a person would otherwise have to tell apart from its own sibling:
     * `:batch` and `:free` are the same model on different terms, `~vendor` is an
     * alias pointer, `openrouter/*` are routers rather than models, and a model
     * that cannot answer in text has nothing to say in a chat.
     *
     * The `-pro` rule is deliberately scoped to OpenAI, where the pro variant is a
     * far more expensive twin of a model already listed. A blanket `-pro` rule
     * would delete flagships in six other companies, so it is not written.
     *
     * Public because Auto has to answer the same question: a model the picker
     * refuses to show is not one Auto may quietly choose on someone's behalf.
     */
    public function hidden(string $id, mixed $model, ?array $snapshot = null): bool
    {
        $vendor = str_contains($id, '/') ? explode('/', $id, 2)[0] : $id;
        if (in_array(strtolower($vendor), self::UNLISTED, true)) return true;
        // A `-latest` id is a moving pointer, so it duplicates whatever it resolves to.
        if (preg_match('/-latest$/i', $id)) return true;
        // OpenAI models that are not what someone picking an AI to code with wants:
        // the cut-down twins, and the open-weights release beside the hosted line.
        if (in_array($id, ['openai/gpt-5.6-luna-mini', 'openai/gpt-5.4-nano', 'openai/gpt-oss-120b'], true)) return true;
        if (preg_match('/:(batch|free)$/i', $id) || str_starts_with($id, '~') || str_starts_with($id, 'openrouter/')) return true;
        if (preg_match('#^openai/.*-pro$#i', $id) && isset(($snapshot ?? $this->pricing->all())[preg_replace('/-pro$/i', '', $id)])) return true;
        if (preg_match('/(^|[^a-z0-9])(preview|experimental|exp)([^a-z0-9]|$)/i', $id)) return true;
        $modalities = is_array($model) ? ($model['output_modalities'] ?? null) : null;
        return is_array($modalities) && $modalities !== ['text'];
    }

    public function resolve(string $id, string $plan = 'free'): array
    {
        if ($id === 'auto') $id = config('vibes.auto_model');
        $entry = config('vibes.models')[$id] ?? null;
        if (! $entry && isset($this->pricing->all()[$id])) {
            // Catalogue models are never trial-funded; they can only be paid for
            // with purchased Vibes, exactly like the curated non-trial models. That
            // is the only line a plan draws here - every plan can reach every model.
            $entry = ['family' => $this->family($id), 'name' => $this->name($this->pricing->all()[$id], $id), 'trial' => false];
        }
        abort_unless($entry, 422, 'Choose a supported model.');
        $price = $this->pricing->refreshPricingFor($id);
        abort_unless(is_array($price) && isset($price['prompt'], $price['completion']), 503, 'This model is temporarily unavailable.');
        // Priced here too, so what the picker showed as included is what is funded.
        $entry['trial'] = $this->includedFree($id);
        return ['id' => $id, ...$entry, 'pricing' => $price, 'tools' => $this->pricing->supportsTerminalToolCalling($id),
            'vision' => $this->pricing->readsImages($id),
            'efforts' => $this->efforts($id), 'defaultEffort' => $this->defaultEffort($id)];
    }

    /**
     * The reasoning levels this model actually accepts, cheapest first. The list
     * is the provider's own, so an effort outside it is one OpenRouter would
     * reject; an empty list means the model's thinking cannot be steered at all.
     */
    public function efforts(string $id): array
    {
        return self::supportedEfforts($this->reasoningFor($id));
    }

    public static function supportedEfforts(?array $reasoning): array
    {
        if (! is_array($reasoning) || ! array_key_exists('supported_efforts', $reasoning)) return [];
        // OpenRouter explicitly defines null as every gateway effort; an omitted
        // key above means no selector. Match the phone's normalizer at this boundary.
        $efforts = $reasoning['supported_efforts'] ?? OpenRouterPricingNormalizer::EFFORTS;
        // A mandatory reasoner cannot be switched off, so 'none' is not offered.
        return array_values(array_filter($efforts, fn ($effort) => ! (($reasoning['mandatory'] ?? false) && $effort === 'none')));
    }

    public function defaultEffort(string $id): ?string
    {
        $default = $this->reasoningFor($id)['default_effort'] ?? null;
        return is_string($default) && in_array($default, $this->efforts($id), true) ? $default : null;
    }

    private function reasoningFor(string $id): ?array
    {
        $model = $this->pricing->all()[trim($id)] ?? null;
        return is_array($model) && is_array($model['reasoning'] ?? null) ? $model['reasoning'] : null;
    }

    /**
     * Whether a free account's trial credit may buy this model. The answer is its
     * price, not a flag someone set by hand: a curated model at or under both
     * ceilings is included and everything else needs purchased Vibes, so a provider
     * reposting a price moves the line by itself instead of leaving a model marked
     * "free" at twenty times what free was meant to cost.
     *
     * An uncurated catalogue model is never included whatever it costs — it carries
     * no tier and no written blurb, so nothing has vetted it for a first chat. The
     * exception is `vibes.free_extra`, which is a deliberate list of picks and so
     * skips the price ceiling and the curation gate alike.
     */
    public function includedFree(string $id, ?array $price = null): bool
    {
        // An explicit pick overrides both gates: it is a decision, not a deduction.
        if (in_array($id, (array) config('vibes.free_extra', []), true)) return true;
        if (! isset(config('vibes.models')[$id])) return false;
        $price ??= $this->pricing->freshPricingFor($id) ?? $this->pricing->pricingFor($id);
        if (! is_array($price) || ! isset($price['prompt'], $price['completion'])) return false;
        $ceiling = config('vibes.free_tier');
        return (float) $price['prompt'] * 1000000 <= $ceiling['input_per_million']
            && (float) $price['completion'] * 1000000 <= $ceiling['output_per_million'];
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
