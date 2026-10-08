<?php

namespace App\Services\Agents;

use App\Services\Vibes\Auto\{Candidates, Decision, Demand, Ladder, Signals, Situation};
use App\Services\Vibes\TurnPrice;

/** Agent-only policy. Selection never changes an already quoted/running task. */
final class ModelRouter
{
    public function __construct(private readonly Candidates $candidates) {}

    public function route(string $text, Situation $situation, object $agent, ?array $semantic = null, ?string $provider = null): Decision
    {
        $s = new Situation($situation->inputBound, min($situation->budget, (int) $agent->budget),
            $situation->trialOnly, $situation->needsTools, $situation->historyBytes,
            $situation->historyTurns, $situation->needsVision, $situation->paidBudget);
        // Only the person's task and saved job inform routing, never tool output.
        $demand = Demand::from(Signals::of($text."\n".mb_substr($agent->brief, 0, 4000), $s->historyBytes, $s->historyTurns));
        $demand = \App\Services\Decisions\SemanticDemand::apply($demand, $semantic);
        // A request to "review" or "plan" alone is ordinary specialist work.
        $hard = $demand->capability >= 0.75 || ($demand->capability >= 0.60 && $demand->deliberation >= 0.90);
        $fast = !$hard && $demand->capability < 0.30 && $demand->deliberation < 0.25;
        $models = (array) config('agents.models');
        $order = $hard ? ['complex', 'default', 'fast'] : ($fast ? ['fast', 'default'] : ['default', 'fast']);
        $ids = array_values(array_unique(array_filter(array_map(fn ($tier) => $models[$tier] ?? null, $order))));
        if ($provider !== null) {
            EngineProviders::preference('provider:'.$provider);
            $ranked = app(\App\Services\Vibes\Auto\Router::class)->ranked($text."\n".$agent->brief, $s);
            $ids = array_values(array_column(array_filter($ranked, fn ($row) => str_starts_with($row['id'], $provider.'/') && in_array($row['id'], (array) config('vibes_auto.models', array_keys((array) config('vibes.models'))), true)), 'id'));
        }
        $rows = array_column($this->candidates->for($s, $ids), null, 'id');
        abort_if($rows === [], 503, 'No suitable Agent model is available for this task right now. Please try again later.');
        foreach ($ids as $index => $id) {
            if (!isset($rows[$id])) continue;
            $row = $rows[$id];
            $wanted = ($provider !== null ? $hard : $id === ($models['complex'] ?? null)) ? 'high' : ($fast ? 'low' : 'medium');
            $levels = array_values(array_filter($row['efforts'], fn ($e) =>
                array_search($e, Ladder::CANONICAL, true) <= array_search($wanted, Ladder::CANONICAL, true)));
            // No known effort ladder means omit reasoning, not invent a level.
            if ($row['efforts'] !== [] && $levels === []) continue;
            foreach ($levels === [] ? [null] : array_reverse($levels) as $effort) {
                [$credits, $fits] = $this->envelope($row, $s, $effort);
                if (!$fits || $credits > $row['budget']) continue;
                $constrained = $index > 0 || ($effort !== null && $effort !== $wanted);
                $reason = $constrained ? 'Chosen to fit this teammate’s task budget and available models.'
                    : ($hard ? 'Chosen for a difficult specialist task.'
                        : ($fast ? 'Chosen for a quick, focused task.' : 'Chosen for everyday specialist work.'));
                return new Decision($id, $effort, $credits, $reason, $demand, $constrained);
            }
        }
        abort(422, 'This task cannot fit the teammate’s budget. Shorten the context or increase its task budget.');
    }

    /** Plan room for one tool round and an answer; the worker still bounds every step. */
    private function envelope(array $row, Situation $s, ?string $effort): array
    {
        $cost = TurnPrice::usd($s->inputBound, $effort, $row['price']);
        $fits = Candidates::fits($row, $s->inputBound, $effort);
        if ($s->needsTools) {
            // Carry the assistant message plus 1K tokens of tool results into the final call.
            // This is a planning allowance, not a guarantee that arbitrary tools fit.
            $nextInput = $s->inputBound + TurnPrice::outputTokens($effort) + 1024;
            $cost += TurnPrice::usd($nextInput, 'none', $row['price']);
            $fits = $fits && Candidates::fits($row, $nextInput, 'none');
        }
        return [max(1, (int) ceil($cost * 100)), $fits];
    }
}
