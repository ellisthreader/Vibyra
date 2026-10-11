<?php
namespace App\Console\Commands;

use Illuminate\Console\Command;

final class PruneAgentBrowser extends Command
{
    protected $signature = 'vibyra:agent-browser-prune';
    protected $description = 'Discard expired private browser input and pixels, ending unfinished private control.';
    public function handle(): int
    {
        $this->info((string) \App\Services\AgentBrowser\PrivateExpiry::prune());
        return self::SUCCESS;
    }
}
