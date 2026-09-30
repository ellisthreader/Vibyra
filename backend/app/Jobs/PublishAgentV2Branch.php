<?php

namespace App\Jobs;

use App\Services\AgentRuns\Computer\ComputerPublish;
use Illuminate\Contracts\Queue\{ShouldBeEncrypted, ShouldQueue};
use Illuminate\Foundation\Queue\Queueable;

/** Encrypted, one-attempt V2 branch write. ComputerPublish reserves the write before calling GitHub. */
final class PublishAgentV2Branch implements ShouldQueue, ShouldBeEncrypted
{
    use Queueable;

    public int $tries = 1;
    public int $timeout = 900;

    public function __construct(public string $actionId, public array $upload)
    {
        $this->onConnection(config('vibes.queue_connection'))->onQueue('vibes');
    }

    public function handle(ComputerPublish $publish): void
    {
        $publish->run($this->actionId, $this->upload);
    }
}
