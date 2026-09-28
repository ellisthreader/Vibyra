<?php

namespace App\Console\Commands;

use App\Services\OpenRouterModelReleases;
use Illuminate\Console\Command;
use RuntimeException;

class SyncOpenRouterModelReleases extends Command
{
    protected $signature = 'vibyra:sync-openrouter-model-releases';

    protected $description = 'Detect newly available OpenRouter models once for every desktop installation.';

    public function handle(OpenRouterModelReleases $releases): int
    {
        try {
            $count = $releases->sync();
        } catch (RuntimeException $error) {
            $this->error($error->getMessage());

            return self::FAILURE;
        }

        $this->info("Detected {$count} new model(s).");

        return self::SUCCESS;
    }
}
