<?php

namespace App\Services\Vibes\Auto;

use App\Services\Billing\OpenRouterPricingCatalog;
use App\Services\Vibes\Catalog;
use App\Services\Vibes\TurnPrice;

/**
 * Auto: which model and which reasoning effort this particular turn should run on.
 *
 * The answer is a fit, not a category. Every model the account can actually send to
 * is scored against what the turn demands, and the winner is the one whose shortfall
 * costs least - where falling short counts far more than being dear, and being dear
 * counts more the less the turn is asking for. That one trade is what makes Auto
 * spend on a hard question and not on an easy one, with nobody maintaining a list of
 * which is which.
 *
 * Candidates are the curated models only. They carry a written blurb, a tier and a
 * profile; they are the only models trial credit can fund; and a router choosing
 * among four hundred unvetted snapshot rows could not say why it chose.
 */
final class Router
{
    public function __construct(
        private readonly Catalog $catalog,
        private readonly OpenRouterPricingCatalog $pricing,
    ) {}

    public function route(string $text, Situation $situation): Decision
    {
        $demand = $this->demand($text, $situation);
        $ranked = $this->rank($demand, $situation);
        if ($ranked === []) return $this->fallback($demand);

        // Scoring and affording are separate questions, answered separately: the list
        // is ranked once on fit, then walked until one candidate's effort can be
        // brought inside the budget. That is what stops Auto proposing a turn the
        // quote would immediately refuse with 422.
        foreach ($ranked as $index => $candidate) {
            $affordable = $this->afford($candidate, $situation);
            if ($affordable === null) continue;
            $constrained = $index > 0 || $affordable['effort'] !== $candidate['effort'];

            return new Decision($candidate['id'], $affordable['effort'], $affordable['credits'],
                Decision::explain($demand, $constrained), $demand, $constrained);
        }

        // Nothing fits the budget. The cheapest turn available is still the right one
        // to quote: `Quotes` then refuses it with the message about the context being
        // too expensive, which is the true reason, rather than one about the model.
        $cheapest = $this->cheapest($ranked, $situation);

        return new Decision($cheapest['id'], $cheapest['effort'], $cheapest['credits'],
            'The most economical model available for a turn this size.', $demand, true);
    }

    /** The ranked candidates, best fit first. Public so tests can read the whole shape. */
    public function ranked(string $text, Situation $situation): array
    {
        return $this->rank($this->demand($text, $situation), $situation);
    }

    public function demand(string $text, Situation $situation): Demand
    {
        return Demand::from(Signals::of($text, $situation->historyBytes, $situation->historyTurns));
    }

    private function rank(Demand $demand, Situation $situation): array
    {
        $scored = array_map(
            fn (array $row) => $this->score($row, $demand, $situation),
            $this->candidates($situation),
        );
        // Ties on fit are settled by price, so an equal fit never costs the person more.
        usort($scored, fn (array $a, array $b) => ($b['score'] <=> $a['score']) ?: ($a['credits'] <=> $b['credits']));

        return $scored;
    }

    /**
     * Every curated model this account could actually send to right now: priced by
     * the live snapshot, not hidden from the picker, fundable by the credit the
     * account holds, and able to call tools when the chat is bound to a project.
     */
    private function candidates(Situation $situation): array
    {
        $rows = [];
        foreach (array_keys((array) config('vibes.models')) as $id) {
            $model = $this->pricing->all()[$id] ?? null;
            $price = is_array($model) ? ($model['pricing'] ?? null) : null;
            // An unpriced model is one OpenRouter is not currently serving. Filtering on
            // the live price keeps Auto off the ids the config still lists but the
            // provider has withdrawn, with no second list to keep in step.
            if (! is_array($price) || ! isset($price['prompt'], $price['completion'])) continue;
            if ($this->catalog->hidden($id, $model)) continue;
            if ($situation->trialOnly && ! $this->catalog->includedFree($id)) continue;
            if ($situation->needsTools && ! $this->pricing->supportsTerminalToolCalling($id)) continue;
            // A photo sent to a model that cannot see it is answered as if it were not there.
            if ($situation->needsVision && ! $this->pricing->readsImages($id)) continue;
            $rows[] = ['id' => $id, 'price' => $price, 'model' => $model,
                'efforts' => Ladder::ordered($this->catalog->efforts($id))];
        }

        return $rows;
    }

    /**
     * The fit of one model to one demand. Shortfall is squared so a model badly short
     * on one axis loses to one slightly short on three: a turn that overflows the
     * context window is not three-quarters right, it is wrong. Strength beyond what
     * the turn needs earns nothing, which is what leaves price to break the tie.
     */
    private function score(array $row, Demand $demand, Situation $situation): array
    {
        $outputPerMillion = (float) $row['price']['completion'] * 1_000_000;
        $profile = Profiles::of($row['id'], $row['model']['context_length'] ?? null, $outputPerMillion);
        $effort = Ladder::choose($row['efforts'], $demand->deliberation);
        $credits = TurnPrice::credits($situation->inputBound, $effort, $row['price']);

        // How much of the capability demand is specifically a demand for code. A hard
        // question about an essay still needs a strong model, just not a coding one.
        $specialism = max($demand->affinity('code'), $demand->affinity('frontend'), $demand->affinity('debug'));
        $shortfall = 1.15 * self::gap($demand->capability, $profile['r'])
            + 1.00 * self::gap($demand->capability * (0.55 + 0.45 * $specialism), $profile['c'])
            + 1.35 * self::gap($demand->breadth, $profile['x']);

        // A model's specialism only earns it anything on work that needs the
        // specialism; on a one-line question, being the coding model is worth little.
        $affinity = 0.0;
        foreach ($profile['a'] as $kind => $weight) $affinity += $weight * $demand->affinity($kind);
        $affinity *= 0.25 + 0.75 * $demand->capability;

        // Price always carries some weight, so two models that fit equally never cost
        // the dearer; it simply carries far less the more the turn is asking for. The
        // square root compresses it, because what matters between a hundredth of a
        // penny and a penny is the ratio, exactly as it is between 10p and a pound.
        //
        // It is measured against the per-turn ceiling rather than against what this
        // account can pay, so the ranking is one judgement about value and not two
        // about money. Running low on Vibes should decide what a person can afford,
        // never which model was the better fit in the first place - and with the
        // balance in here as well, a stepped-back choice was indistinguishable from
        // a first choice, so the quote could not honestly say which it was.
        $share = min(1.0, TurnPrice::usd($situation->inputBound, $effort, $row['price'])
            / (TurnPrice::CEILING / 100));
        $cost = 0.55 * sqrt($share) * (0.15 + 0.85 * (1.0 - $demand->pressure()));

        return $row + ['effort' => $effort, 'credits' => $credits, 'score' => $affinity - $shortfall - $cost];
    }

    /**
     * The same model at a level it can pay for. Effort is stepped down before the
     * model is given up on, because a strong model thinking briefly beats a weak one
     * thinking hard on nearly everything Auto is asked to route.
     */
    private function afford(array $candidate, Situation $situation): ?array
    {
        $effort = $candidate['effort'];
        $credits = $candidate['credits'];
        while ($credits > $situation->budget) {
            $cheaper = Ladder::cheaper($candidate['efforts'], $effort);
            if ($cheaper === null) return null;
            $effort = $cheaper;
            $credits = TurnPrice::credits($situation->inputBound, $effort, $candidate['price']);
        }

        return ['effort' => $effort, 'credits' => $credits];
    }

    private function cheapest(array $ranked, Situation $situation): array
    {
        $priced = array_map(function (array $row) use ($situation) {
            $effort = $row['efforts'][0] ?? null;

            return array_replace($row, ['effort' => $effort,
                'credits' => TurnPrice::credits($situation->inputBound, $effort, $row['price'])]);
        }, $ranked);
        usort($priced, fn (array $a, array $b) => $a['credits'] <=> $b['credits']);

        return $priced[0];
    }

    /**
     * No curated model is servable at all. The configured constant is the last
     * resort, and `Catalog::resolve` raises the honest 503 if it is unservable too.
     */
    private function fallback(Demand $demand): Decision
    {
        $id = (string) config('vibes.auto_model');
        $efforts = Ladder::ordered($this->catalog->efforts($id));

        return new Decision($id, Ladder::choose($efforts, $demand->deliberation), 0,
            'The default Auto model.', $demand, true);
    }

    /** Squared shortfall, and nothing at all for capability the turn does not need. */
    private static function gap(float $need, float $have): float
    {
        return max(0.0, $need - $have) ** 2;
    }
}
