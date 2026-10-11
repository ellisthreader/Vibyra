<?php
namespace App\Console\Commands;
use App\Services\AgentOrganizations\{Maintenance, Retention};
use Illuminate\Console\Command;
final class AgentOrganisations extends Command
{
    protected $signature = 'vibyra:agent-organisations {--retention}';
    protected $description = 'Stop organisation tasks whose authority ended and optionally prune terminal task content.';
    public function handle(): int
    {
        $this->info('Stopped '.Maintenance::stopRevoked().' organisation tasks.');
        if ($this->option('retention')) $this->info('Cleared '.Retention::prune().' expired task histories.');
        return self::SUCCESS;
    }
}
