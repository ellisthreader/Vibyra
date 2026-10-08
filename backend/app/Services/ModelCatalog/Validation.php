<?php

namespace App\Services\ModelCatalog;

use Illuminate\Support\Facades\DB;

final class Validation
{
    public function run(int $limit = 2): int
    {
        if (! config('model_catalog.validate') || ! config('model_catalog.probe_key')) return 0;
        $rows = DB::table('model_catalog_models')->where('misses', 0)
            ->whereNotIn('id', config('model_catalog.quarantined'))->where(function ($q) {
                $q->whereIn('status', ['discovered', 'quarantined'])->orWhere(function ($q) {
                    $q->where('status', 'eligible')->where('verified_at', '<', now()->subHours(config('model_catalog.proof_hours')));
                });
            })->orderBy('verified_at')->orderBy('id')->limit(config('model_catalog.max_models'))->get();
        $count = 0;
        $attempted = 0;
        foreach ($rows as $row) {
            if ($attempted >= $limit) break;
            // An interrupted/ambiguous paid call is never silently repeated.
            if (DB::table('model_catalog_attempts')->where('model_id', $row->id)->where('kind', 'probe')
                ->whereIn('state', ['dispatching', 'unknown'])->exists()) continue;
            $versions = array_map(fn ($try) => hash('sha256', $row->fingerprint.':'.now('UTC')->format('Y-m-d').':'.$try), range(0, 2));
            $previous = DB::table('model_catalog_attempts')->where('model_id', $row->id)->where('kind', 'probe')
                ->whereIn('fingerprint', $versions)->orderBy('created_at')->get();
            if ($previous->count() >= 3 || $previous->contains('state', 'succeeded')) continue;
            $delay = $previous->count() === 1 ? 15 : 60;
            if ($previous->last() && \Illuminate\Support\Carbon::parse($previous->last()->created_at)->gt(now()->subMinutes($delay))) continue;
            $m = json_decode($row->metadata, true, 32, JSON_THROW_ON_ERROR);
            $calls = 1 + max(1, count($m['efforts']));
            // Inputs are fixed and under 4096 tokens; reserve the full output cap.
            $micro = max(1, (int) ceil(($calls * (4096 * (float) $m['pricing']['prompt'] + 256 * (float) $m['pricing']['completion'])) * 1000000));
            $attempt = app(Attempts::class)->claim($row->id, $versions[$previous->count()], 'probe', $micro);
            if (! $attempt) continue;
            $attempted++;
            try {
                $proof = app(Probe::class)->run($m);
                DB::table('model_catalog_models')->where('id', $row->id)->where('fingerprint', $row->fingerprint)
                    ->update(['status' => 'eligible', 'verified_at' => now(), 'proof' => json_encode($proof), 'reason' => null]);
                app(Attempts::class)->finish($attempt, 'succeeded');
                $count++;
            } catch (\Illuminate\Http\Client\ConnectionException) {
                app(Attempts::class)->finish($attempt, 'unknown');
                DB::table('model_catalog_models')->where('id', $row->id)->update(['reason' => 'probe-outcome-unknown']);
            } catch (\Throwable) {
                app(Attempts::class)->finish($attempt, 'failed');
                DB::table('model_catalog_models')->where('id', $row->id)->where('fingerprint', $row->fingerprint)
                    ->update(['status' => 'quarantined', 'reason' => 'route-check-failed']);
            }
        }
        return $count;
    }
}
