<?php

namespace App\Console\Commands;

use App\Services\AgentRuns\Tools\DispatchSweeper;
use Illuminate\Console\Command;

/**
 * Every minute, one server: close Agent V2 actions a dead API or worker process left `dispatching`
 * (`agents_v2.dispatch_stale_minutes`). A write is never sent again; it is confirmed by one read-only
 * lookup or left `unknown`, which unblocks the runner's /complete and a cancel. An action left `approved`
 * with no dispatch claim (a crash before the claim) is dispatched once through the normal approval path.
 */
final class AgentV2SweepDispatching extends Command
{
    protected $signature = 'vibyra:agent-v2-sweep-dispatching';
    protected $description = 'Close Agent V2 actions stuck dispatching (confirm by lookup or mark unknown, never re-send) and dispatch approved ones stranded before any claim';

    public function handle(DispatchSweeper $sweeper): int
    {
        if (!config('agents_v2.enabled')) return self::SUCCESS;
        $done = $sweeper->sweep();
        $this->line(sprintf('confirmed=%d unknown=%d failed=%d dispatched=%d refused=%d', $done['confirmed'], $done['unknown'], $done['failed'], $done['dispatched'], $done['refused']));
        return self::SUCCESS;
    }
}
