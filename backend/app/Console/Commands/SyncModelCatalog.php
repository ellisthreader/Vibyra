<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

/** Keep old cron/manual invocations harmless after the CLI-only migration. */
final class SyncModelCatalog extends Command
{
    protected $signature = 'vibyra:sync-model-catalog {--rollback= : Retired; no publication is performed}';
    protected $description = 'Retired: model updates now use connected CLI account discovery.';

    public function handle(): int
    {
        $this->info('Automatic model updates use connected CLI accounts and local icons; server catalogue jobs are disabled.');
        return self::SUCCESS;
    }
}
