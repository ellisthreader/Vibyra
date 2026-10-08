<?php

namespace App\Jobs;

use App\Services\AgentTriggers\SlackEvents;
use Illuminate\Contracts\Queue\{ShouldBeEncrypted, ShouldQueue};
use Illuminate\Foundation\Queue\Queueable;

/** One verified Slack mention, admitted off the request path (Slack wants its 2xx within three seconds). Safe to repeat. */
final class ProcessSlackEvent implements ShouldQueue, ShouldBeEncrypted
{
    use Queueable;

    public int $tries = 3;
    public int $timeout = 60;

    public function __construct(public array $envelope)
    {
        $this->onConnection(config('vibes.queue_connection'))->onQueue('vibes');
    }

    public function handle(SlackEvents $events): void
    {
        $events->route($this->envelope);
    }
}
