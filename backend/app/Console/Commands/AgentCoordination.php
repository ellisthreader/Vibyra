<?php
namespace App\Console\Commands;
use Illuminate\Console\Command;
final class AgentCoordination extends Command
{
    protected $signature = 'vibyra:agent-coordination';
    protected $description = 'Advance bounded reviewed Agent group workflows.';
    public function handle(): int
    {
        app(\App\Services\AgentCoordination\WorkflowProgress::class)->tick();
        return self::SUCCESS;
    }
}
