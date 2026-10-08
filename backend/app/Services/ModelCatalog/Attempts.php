<?php

namespace App\Services\ModelCatalog;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Durable reserve-before-send. Unknown results keep their reserve; never replay them. */
final class Attempts
{
    public function claim(string $model, string $fingerprint, string $kind, int $micro): ?string
    {
        $cap = (int) config("model_catalog.{$kind}_daily_micro", 0);
        if ($micro <= 0 || $cap <= 0 || $micro > $cap) return null;
        return DB::transaction(function () use ($model, $fingerprint, $kind, $micro, $cap) {
            $budget = now('UTC')->format('Y-m-d').':'.$kind;
            DB::table('model_catalog_budgets')->insertOrIgnore(['id' => $budget]);
            $row = DB::table('model_catalog_budgets')->where('id', $budget)->lockForUpdate()->first();
            if ($row->reserved_micro + $micro > $cap) return null;
            $id = (string) Str::uuid();
            $inserted = DB::table('model_catalog_attempts')->insertOrIgnore([
                'id' => $id, 'model_id' => $model, 'fingerprint' => $fingerprint, 'kind' => $kind,
                'reserved_micro' => $micro, 'created_at' => now(),
            ]);
            if (! $inserted) return null;
            DB::table('model_catalog_budgets')->where('id', $budget)->increment('reserved_micro', $micro);
            return $id;
        });
    }

    public function finish(string $id, string $state): void
    {
        DB::table('model_catalog_attempts')->where('id', $id)->where('state', 'dispatching')
            ->update(['state' => $state, 'finished_at' => now()]);
    }
}
