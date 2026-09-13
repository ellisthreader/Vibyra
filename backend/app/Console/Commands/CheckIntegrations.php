<?php

namespace App\Console\Commands;

use App\Services\Integrations\Catalog;
use Illuminate\Console\Command;

class CheckIntegrations extends Command
{
    protected $signature = 'integrations:check';

    protected $description = 'Show provider configuration readiness without exposing credentials';

    public function handle(): int
    {
        $rows = array_map(fn ($p) => [$p['name'], $p['ready'] ? 'Configured (live account test still required)' : 'Setup needed',
            Catalog::callback($p['id'])], Catalog::visible());
        $this->table(['Service', 'Registration configuration', 'Register this callback'], $rows);
        $this->line('Configuration presence does not prove provider approval or a successful account connection.');

        return collect(Catalog::visible())->every(fn ($p) => $p['ready']) ? self::SUCCESS : self::FAILURE;
    }
}
