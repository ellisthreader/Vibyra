<?php

namespace App\Console\Commands;

use App\Services\ModelCatalog\{Artwork, AutomationKeys, Discovery, Publisher, Validation};
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

final class SyncModelCatalog extends Command
{
    protected $signature = 'vibyra:sync-model-catalog {--rollback= : Republish a previously signed revision}';
    protected $description = 'Discover, verify and publish compatible model updates without changing sessions.';

    public function handle(): int
    {
        if (! config('model_catalog.enabled')) return self::SUCCESS;
        $lock = Cache::lock('model-catalog-sync-v1', 900);
        if (! $lock->get()) return self::SUCCESS;
        try {
            if ($this->option('rollback')) {
                $this->info('Published rollback revision '.app(Publisher::class)->publish((int) $this->option('rollback')));
                return self::SUCCESS;
            }
            if (config('model_catalog.validate')) app(AutomationKeys::class)->verify('probe');
            if (config('model_catalog.artwork')) app(AutomationKeys::class)->verify('artwork');
            app(Discovery::class)->run();
            $verified = app(Validation::class)->run();
            if ($verified) app(\App\Services\Billing\OpenRouterPricingCatalog::class)->sync();
            app(Artwork::class)->run();
            $revision = app(Publisher::class)->publish();
            DB::table('model_catalog_state')->where('id', 1)->update(['last_run_at' => now()]);
            $this->info('Model catalog checked'.($revision ? "; revision {$revision}." : ' in shadow mode.'));
            return self::SUCCESS;
        } finally {
            $lock->release();
        }
    }
}
