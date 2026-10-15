<?php
namespace App\Jobs;

use App\Services\LiveActivities\Dispatcher;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/** Sends a run's current state to its Live Activities. One try: a Live Activity write is never replayed. */
final class SendLiveActivityUpdate implements ShouldQueue
{
    use Queueable;
    public int $tries = 1;
    public int $timeout = 20;

    public function __construct(public string $runId)
    {
        $this->onQueue('notifications');
    }

    public function handle(Dispatcher $dispatcher): void
    {
        $dispatcher->deliver($this->runId);
    }
}
