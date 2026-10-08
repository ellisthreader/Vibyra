<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Services\ModelCatalog\Health;
use Illuminate\Support\Facades\DB;

final class ModelCatalogStatus extends Command
{
    protected $signature = 'vibyra:model-catalog-status';
    protected $description = 'Machine-readable catalog health; exits nonzero for a stalled enabled service.';

    public function handle(): int
    {
        $enabled = (bool) config('model_catalog.enabled');
        $row = DB::table('model_catalog_state')->where('id', 1)->first();
        $healthy = app(Health::class)->status()['healthy'];
        $this->line(json_encode(['enabled' => $enabled, 'healthy' => (bool) $healthy,
            'revision' => $row?->revision, 'lastDiscovery' => $row?->last_discovery_at,
            'lastRun' => $row?->last_run_at,
            'models' => DB::table('model_catalog_models')->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status'),
            'unknownAttempts' => DB::table('model_catalog_attempts')->whereIn('state', ['dispatching', 'unknown'])->count(),
            'todayReservedMicro' => DB::table('model_catalog_budgets')->where('id', 'like', now('UTC')->format('Y-m-d').':%')->sum('reserved_micro'),
        ], JSON_THROW_ON_ERROR));
        return $healthy ? self::SUCCESS : self::FAILURE;
    }
}
