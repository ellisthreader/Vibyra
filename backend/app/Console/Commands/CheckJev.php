<?php
namespace App\Console\Commands;
use App\Services\Decisions\ProviderKeyPolicy;
use Illuminate\Console\Command;
final class CheckJev extends Command
{
    protected $signature = 'vibyra:check-jev';
    protected $description = 'Check configured Jev key budget without running inference or printing credentials';
    public function handle(ProviderKeyPolicy $policy): int
    {
        try {
            $policy->assertSafe();
            $this->info('Dedicated key budget verified. This did not send a task or enable Jev.');
            return self::SUCCESS;
        } catch (\Throwable) {
            $this->error('Jev remains unavailable: use a dedicated inference key with a non-renewing limit at or below the configured lifetime budget, BYOK included, and credit remaining. Check connectivity too.');
            return self::FAILURE;
        }
    }
}
