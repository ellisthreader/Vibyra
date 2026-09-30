<?php

namespace App\Console\Commands;

use App\Services\AgentRuns\Retention;
use Illuminate\Console\Command;

/** Daily: age out old Agent V2 run journals and attachment files, and sweep orphaned rows (`agents_v2.retention`). */
final class AgentV2Retention extends Command
{
    protected $signature = 'vibyra:agent-v2-retention';
    protected $description = 'Prune old Agent V2 run events and attachments per the retention settings';

    public function handle(Retention $retention): int
    {
        $done = $retention->prune();
        $this->line(sprintf('events=%d attachments=%d orphans=%d', $done['events'], $done['attachments'], $done['orphans']));
        return self::SUCCESS;
    }
}
