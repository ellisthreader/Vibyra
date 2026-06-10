<?php

namespace App\Console\Commands;

use App\Services\Billing\OpenRouterPricingCatalog;
use Illuminate\Console\Command;
use RuntimeException;

class SyncOpenRouterPricing extends Command
{
    protected $signature = 'vibyra:sync-openrouter-pricing';

    protected $description = 'Sync the last-known-good OpenRouter model pricing catalog.';

    public function handle(OpenRouterPricingCatalog $catalog): int
    {
        try {
            $snapshot = $catalog->sync();
        } catch (RuntimeException $error) {
            $this->error($error->getMessage());

            return self::FAILURE;
        }

        $this->info('Synced '.count($snapshot['models']).' OpenRouter model(s).');

        return self::SUCCESS;
    }
}
