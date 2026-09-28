<?php

namespace App\Jobs;

use App\Services\Agents\ToolActions;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class RunAgentTool implements ShouldQueue
{
    use Queueable;
    public int $tries = 1;
    public int $timeout = 80;

    public function __construct(public string $toolId)
    {
        $this->onConnection(config('vibes.queue_connection'))->onQueue('vibes');
    }

    public function handle(ToolActions $actions): void { $actions->execute($this->toolId); }
}
