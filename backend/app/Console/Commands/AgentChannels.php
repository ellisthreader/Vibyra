<?php
namespace App\Console\Commands;
use Illuminate\Console\Command;
final class AgentChannels extends Command
{
    protected $signature='vibyra:agent-channels';
    protected $description='Admit verified bounded channel messages when their thread is ready.';
    public function handle(): int {app(\App\Services\AgentChannels\Admit::class)->tick();return self::SUCCESS;}
}
