<?php

namespace App\Jobs;

use App\Services\Agents\BranchPublication\BranchDelivery;
use Illuminate\Contracts\Queue\{ShouldBeEncrypted, ShouldQueue};
use Illuminate\Foundation\Queue\Queueable;

/** Encrypted, one-attempt upload. BranchDelivery reserves the write before calling GitHub. */
final class PublishAgentBranch implements ShouldQueue, ShouldBeEncrypted
{
    use Queueable;

    public int $tries = 1;
    public int $timeout = 900;

    public function __construct(public string $workspaceId, public string $toolId,
        public array $upload)
    {
        $this->onConnection(config('vibes.queue_connection'))->onQueue('vibes');
    }

    public function handle(BranchDelivery $delivery): void
    {
        $delivery->run($this->workspaceId, $this->toolId, $this->upload);
    }
}
