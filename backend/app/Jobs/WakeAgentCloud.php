<?php
namespace App\Jobs;

use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

final class WakeAgentCloud implements ShouldQueue
{
    use Queueable;
    public int $tries = 1;
    public function __construct(public readonly string $runId) { $this->onQueue('cloud-workspaces'); }
    public function handle(): void { app(\App\Services\AgentRuns\Cloud\WakePending::class)->run($this->runId); }
}
