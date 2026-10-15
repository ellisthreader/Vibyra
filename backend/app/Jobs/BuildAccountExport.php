<?php

namespace App\Jobs;

use App\Services\Privacy\AccountExports;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/** Builds one account export (roadmap Part 19). Carries only the export id; the build claims the row, so a duplicate does nothing. */
class BuildAccountExport implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;
    public int $timeout = 300;

    public function __construct(public string $exportId) {}

    public function handle(AccountExports $exports): void
    {
        $exports->build($this->exportId);
    }
}
