<?php
namespace App\Jobs;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\{InteractsWithQueue,SerializesModels};
final class ProcessAgentChannelEvent implements ShouldQueue
{
    use Dispatchable,InteractsWithQueue,Queueable,SerializesModels;
    public int $tries=3;
    public function __construct(public readonly string $eventId) {}
    public function handle(): void {app(\App\Services\AgentChannels\Admit::class)->event($this->eventId);}
}
