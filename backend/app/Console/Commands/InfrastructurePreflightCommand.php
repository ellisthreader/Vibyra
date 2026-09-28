<?php

namespace App\Console\Commands;

use App\Services\InfrastructurePreflight;
use Illuminate\Console\Command;

class InfrastructurePreflightCommand extends Command
{
    protected $signature = 'vibyra:infrastructure-preflight
        {--strict : Treat recommendations as deployment-blocking failures}';

    protected $description = 'Validate provider-neutral production infrastructure requirements';

    public function handle(InfrastructurePreflight $preflight): int
    {
        $issues = $preflight->inspect();

        foreach ($issues as $issue) {
            $this->{$issue['level'] === 'error' ? 'error' : 'warn'}(
                "[{$issue['code']}] {$issue['message']}"
            );
        }

        if (collect($issues)->contains('level', 'error') || ($this->option('strict') && $issues !== [])) {
            return self::FAILURE;
        }

        $this->info('Infrastructure preflight passed.');

        return self::SUCCESS;
    }
}
