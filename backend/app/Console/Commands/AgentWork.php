<?php
namespace App\Console\Commands;

use App\Services\AgentWork\{GoalProgress, FollowUpProgress};
use App\Services\AgentWork\Signals\{Discovery, Digests};
use Illuminate\Console\Command;

final class AgentWork extends Command
{
    protected $signature = 'vibyra:agent-work';
    protected $description = 'Advance reviewed Agent goals/follow-ups and collect opted-in signals.';

    public function handle(): int
    {
        if (!config('agents_v2.work_enabled')) return self::SUCCESS;
        $failed = false;
        foreach ([GoalProgress::class, FollowUpProgress::class, Discovery::class, Digests::class] as $service) {
            try { app($service)->tick(); }
            catch (\Throwable $e) { report($e); $failed = true; }
        }
        return $failed ? self::FAILURE : self::SUCCESS;
    }
}
