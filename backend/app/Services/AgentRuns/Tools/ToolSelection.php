<?php

namespace App\Services\AgentRuns\Tools;

use App\Models\AgentV2\Run;

/**
 * Chooses which granted tools fill a run's capped manifest (rebuild plan §3 rule 3:
 * deterministic metadata, never a model call). Only tools already granted on healthy
 * connections reach here; selection can drop tools, never add them.
 *
 * Accounts are ranked by Relevance score (ties keep connection order). Accounts with
 * the same score form a tier; within a tier tools are taken round-robin, one per
 * account per round, all reads before any write, so one account with many tools
 * (e.g. eight Mac folder tools) cannot crowd out another, and a write never gets in
 * while a read of the same account was cut. Inside an account, tools whose own words
 * appear in the prompt come first, then catalogue order.
 */
final class ToolSelection
{
    public function __construct(private readonly Relevance $relevance) {}

    /**
     * @param array<int, array> $candidates manifest entries in grant/catalogue order
     * @return array{tools: array, dropped: array, scores: array<string, int>}
     */
    public function select(Run $run, array $candidates, int $cap): array
    {
        $groups = [];
        foreach ($candidates as $index => $tool) {
            $id = $tool['connectionId'];
            $groups[$id] ??= ['id' => $id, 'order' => count($groups), 'provider' => $tool['provider'],
                'account' => $tool['account'] ?? null, 'reads' => [], 'writes' => []];
            $hits = $this->relevance->toolHits($run, $tool['tool']);
            $groups[$id][$tool['kind'] === 'write' ? 'writes' : 'reads'][] = ['hits' => $hits, 'index' => $index, 'tool' => $tool];
        }
        $scores = $this->relevance->scores($run, array_map(fn ($g) => [$g['id'], $g['provider'], $g['account']], array_values($groups)));
        foreach ($groups as &$group) {
            foreach (['reads', 'writes'] as $bucket)
                usort($group[$bucket], fn ($a, $b) => [$b['hits'], $a['index']] <=> [$a['hits'], $b['index']]);
        }
        unset($group);
        $tiers = [];
        foreach ($groups as $group) $tiers[$scores[$group['id']] ?? 0][] = $group;
        krsort($tiers, SORT_NUMERIC);
        $picked = [];
        foreach ($tiers as $tier) {
            usort($tier, fn ($a, $b) => $a['order'] <=> $b['order']);
            foreach (['reads', 'writes'] as $bucket) $this->roundRobin($tier, $bucket, $cap, $picked);
        }
        $chosen = array_map(fn ($p) => $p['tool'], $picked);
        $keys = array_flip(array_map(fn ($p) => $p['index'], $picked));
        $dropped = array_values(array_filter($candidates, fn ($t, $i) => !isset($keys[$i]), ARRAY_FILTER_USE_BOTH));
        return ['tools' => $chosen, 'dropped' => $dropped, 'scores' => $scores];
    }

    private function roundRobin(array $tier, string $bucket, int $cap, array &$picked): void
    {
        for ($round = 0; count($picked) < $cap; $round++) {
            $took = false;
            foreach ($tier as $group) {
                if (count($picked) >= $cap) return;
                if (!isset($group[$bucket][$round])) continue;
                $picked[] = $group[$bucket][$round];
                $took = true;
            }
            if (!$took) return;
        }
    }
}
