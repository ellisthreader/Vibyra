<?php
namespace App\Jobs;

use App\Services\CloudWorkspaces\Lifecycle;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

final class ReconcileCloudWorkspace implements ShouldQueue
{
    use Queueable;
    public int $tries = 5;
    public int $timeout = 80;
    public function __construct(public string $workspaceId)
    {
        $this->onConnection(config('cloud_workspaces.queue_connection'))->onQueue('cloud-workspaces');
    }
    public function backoff(): array { return [2, 5, 10, 20]; }
    public function handle(Lifecycle $lifecycle): void { $lifecycle->reconcile($this->workspaceId); }
}
