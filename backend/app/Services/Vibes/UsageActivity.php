<?php

namespace App\Services\Vibes;

use App\Services\Billing\OpenRouterPricingCatalog;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Usage history, said in what the tokens were for. Every ledger reference already names its
 * source (`hold:<turn>`, `cloud-hold:<reservation>`, `assistant-hold:<request>`), so the detail
 * is read from those rows rather than copied into the ledger, and old entries gain it too.
 *
 * The `usage` view folds each spend's hold and its settlement into one entry: what it actually
 * cost once settled, or what is held while it runs. Settlements and zero-unit bookkeeping rows
 * (budgets, migrations, claims) are left out; grants, refunds and expiries pass through.
 */
final class UsageActivity
{
    private const SETTLEMENTS = ['settlement', 'cloud_settlement', 'assistant_settlement'];
    private const SOURCES = ['hold' => 'ai', 'cloud_hold' => 'cloud', 'assistant_hold' => 'assistant'];

    public function page(int $userId, ?int $before, bool $usage): array
    {
        $rows = DB::table('vibes_ledger')->where('user_id', $userId)
            ->when($before, fn ($q) => $q->where('id', '<', $before))
            ->when($usage, fn ($q) => $q->whereNotIn('kind', self::SETTLEMENTS)->where('delta', '!=', 0))
            ->orderByDesc('id')->limit(51)->get();
        $shown = $rows->take(50);
        $details = $this->details($shown);
        $items = $shown->map(function ($l) use ($details, $usage) {
            $detail = $details[$l->id] ?? null;
            $delta = (int) $l->delta;
            $kind = $l->kind;
            if ($usage && isset(self::SOURCES[$l->kind]) && $detail) {
                $kind = self::SOURCES[$l->kind];
                // Settled: what it cost. Running: what is held for it.
                if ($detail['status'] !== 'running') $delta = -(int) $detail['chargedUnits'];
            }
            return ['id' => (string) $l->id, 'kind' => $kind, 'deltaUnits' => (string) $delta,
                'unitScale' => $l->unit_scale, 'createdAt' => $l->created_at, 'detail' => $detail];
        })->values();
        return ['items' => $items, 'next' => $rows->count() > 50 ? (string) $rows[49]->id : null];
    }

    /** @return array<int, array> ledger id => detail, one query per source for the whole page. */
    public function details(Collection $rows): array
    {
        $ids = fn (array $prefixes) => $rows->map(fn ($l) => $this->target($l->reference, $prefixes))->filter()->unique()->values()->all();
        $turns = DB::table('vibes_turns')->whereIn('id', $ids(['hold:', 'settle:']))
            ->get(['id', 'model', 'reserved', 'charged', 'settled_at', 'status', 'input_tokens', 'output_tokens'])->keyBy('id');
        $reservations = DB::table('cloud_reservations as r')->leftJoin('cloud_workspaces as w', 'w.id', '=', 'r.workspace_id')
            ->whereIn('r.id', $ids(['cloud-hold:', 'cloud-settle:']))
            ->get(['r.id', 'r.reserved', 'r.charged', 'r.created_at', 'r.settled_at', 'r.billed_seconds', 'r.token_seconds', 'w.name', 'w.kind'])->keyBy('id');
        $requests = DB::table('assistant_requests')->whereIn('id', $ids(['assistant-hold:', 'assistant-settle:']))
            ->get(['id', 'kind', 'state', 'reserved_units', 'charged_units'])->keyBy('id');
        $grants = DB::table('vibes_grants')->whereIn('reference', $rows->where('kind', 'grant')->pluck('reference')->all())
            ->pluck('kind', 'reference');
        $models = $turns->isEmpty() ? [] : app(OpenRouterPricingCatalog::class)->all();
        $out = [];
        foreach ($rows as $l) {
            if ($t = $turns[$this->target($l->reference, ['hold:', 'settle:'])] ?? null) $out[$l->id] = $this->turn($t, $models);
            elseif ($r = $reservations[$this->target($l->reference, ['cloud-hold:', 'cloud-settle:'])] ?? null) $out[$l->id] = $this->cloud($r);
            elseif ($a = $requests[$this->target($l->reference, ['assistant-hold:', 'assistant-settle:'])] ?? null) $out[$l->id] = $this->assistant($a);
            elseif ($l->kind === 'grant' && isset($grants[$l->reference])) $out[$l->id] = ['source' => 'grant', 'grantKind' => $grants[$l->reference]];
        }
        return $out;
    }

    private function target(string $reference, array $prefixes): ?string
    {
        foreach ($prefixes as $p) if (str_starts_with($reference, $p)) return substr($reference, strlen($p));
        return null;
    }

    private function turn(object $t, array $models): array
    {
        return ['source' => 'ai', 'model' => $t->model, 'modelName' => app(Catalog::class)->displayName($t->model, $models),
            'inputTokens' => $t->input_tokens === null ? null : (int) $t->input_tokens,
            'outputTokens' => $t->output_tokens === null ? null : (int) $t->output_tokens,
            'chargedUnits' => (string) ($t->settled_at ? (int) $t->charged : (int) $t->reserved),
            'status' => $t->settled_at ? ($t->status === 'completed' ? 'done' : $t->status) : 'running'];
    }

    private function cloud(object $r): array
    {
        $charged = $r->settled_at ? (int) $r->charged : (int) $r->reserved;
        // Settled stretches carry the Meter's own seconds; a running one has run since it began.
        $seconds = $r->settled_at ? (int) $r->billed_seconds : max(0, time() - strtotime((string) $r->created_at));
        return ['source' => 'cloud', 'workspaceKind' => $r->kind ?? 'project', 'name' => $r->name,
            'seconds' => $seconds,
            // The part paid in tokens; included Pro hours are the rest.
            'tokenSeconds' => $r->settled_at ? (int) $r->token_seconds : null,
            'chargedUnits' => (string) $charged, 'status' => $r->settled_at ? 'done' : 'running'];
    }

    private function assistant(object $a): array
    {
        $settled = $a->charged_units !== null;
        return ['source' => 'assistant', 'service' => $a->kind,
            'chargedUnits' => (string) ($settled ? (int) $a->charged_units : (int) $a->reserved_units),
            'status' => $settled ? 'done' : ($a->state === 'reserved' ? 'running' : $a->state)];
    }
}
