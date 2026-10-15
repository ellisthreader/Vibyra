<?php

namespace App\Console\Commands;

use App\Services\Privacy\AccountExports;
use Illuminate\Console\Command;

/** Hourly: delete "Download my data" archives past their keep time and fail builds that never finished. */
final class PruneAccountExports extends Command
{
    protected $signature = 'vibyra:prune-account-exports';
    protected $description = 'Delete expired account data export archives';

    public function handle(AccountExports $exports): int
    {
        $this->line('expired='.$exports->prune());
        return self::SUCCESS;
    }
}
