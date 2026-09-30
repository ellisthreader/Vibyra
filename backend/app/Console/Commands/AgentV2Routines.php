<?php

namespace App\Console\Commands;

use App\Services\AgentSchedules\Scheduler;
use App\Services\AgentTriggers\Pollers;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;

/**
 * Agent V2 routines tick (every minute, one server): claim due schedule occurrences,
 * expire stale waiting ones, poll Gmail/Calendar triggers. Every run it starts goes
 * through the ordinary account-funded Admission. Writes a heartbeat for monitoring.
 */
final class AgentV2Routines extends Command
{
    protected $signature = 'vibyra:agent-v2-routines';
    protected $description = 'Admit due Agent V2 schedule occurrences and poll event triggers';

    public function handle(Scheduler $scheduler, Pollers $pollers): int
    {
        if (!config('agents_v2.enabled')) return self::SUCCESS;
        $stats = $scheduler->tick();
        $polled = $pollers->tick();
        Cache::put('agents_v2:routines_heartbeat', now()->toIso8601String(), now()->addDay());
        $this->line(sprintf('claimed=%d admitted=%d expired=%d polled=%d', $stats['claimed'], $stats['admitted'], $stats['expired'], $polled));
        return self::SUCCESS;
    }
}
