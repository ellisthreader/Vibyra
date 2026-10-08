<?php
namespace App\Console\Commands;

use Illuminate\Console\Command;

final class AgentCloudWake extends Command
{
    protected $signature = 'vibyra:agent-cloud-wake';
    protected $description = 'Wake explicitly authorized cloud Agent tasks within saved compute limits.';
    public function handle(): int
    {
        $this->info((string) app(\App\Services\AgentRuns\Cloud\WakePending::class)->tick());
        return self::SUCCESS;
    }
}
