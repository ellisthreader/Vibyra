<?php

namespace App\Console\Commands;

use App\Services\AgentRuns\Connections\LegacyInstalls;
use Illuminate\Console\Command;

/**
 * Optional pre-warm: gives every existing chat-connector install its Agent V2 connection row. Never required, because
 * every V2 read path syncs the account it serves; run it once after switching V2 on to have the rows up front.
 * Chunked, idempotent and time-bounded; it prints where to resume if it stopped on the time limit.
 */
final class AgentV2BackfillInstalls extends Command
{
    protected $signature = 'vibyra:agent-v2-backfill-installs {--after=0 : Resume after this install id} {--max-seconds=120}';
    protected $description = 'Create Agent V2 connection rows for existing chat-connector installs (chunked, idempotent)';

    public function handle(): int
    {
        $after = max(0, (int) $this->option('after'));
        $last = LegacyInstalls::backfill(null, microtime(true) + max(1, (int) $this->option('max-seconds')), $after);
        $more = \Illuminate\Support\Facades\DB::table('vibes_integration_installs')->where('id', '>', $last)->exists();
        $this->line(sprintf('last_install_id=%d %s', $last, $more ? '(time limit reached: run again with --after='.$last.')' : '(done)'));
        return self::SUCCESS;
    }
}
