<?php

namespace App\Services\Agents;

use App\Services\ChatConnectors\Registry;

/** The connector's exact advertised operation is the authority for its risk. */
final class ToolPolicy
{
    public function __construct(private readonly Registry $registry) {}

    public function requiresApproval(string $integration, string $operation): bool
    {
        $connector = $this->registry->for($integration);
        $offered = array_column(array_column($connector->definitions(), 'function'), 'name');
        abort_unless(in_array($operation, $offered, true), 409, 'This tool is no longer available. Start a new task.');
        $reads = $connector->reads();
        $writes = $connector->writes();
        abort_unless(count($offered) === count(array_unique($offered))
            && count($reads) === count(array_unique($reads))
            && count($writes) === count(array_unique($writes))
            && count(array_intersect($reads, $writes)) === 0
            && count(array_diff($offered, [...$reads, ...$writes])) === 0
            && count(array_diff([...$reads, ...$writes], $offered)) === 0,
            409, 'This integration has an invalid tool policy.');
        return in_array($operation, $writes, true);
    }
}
