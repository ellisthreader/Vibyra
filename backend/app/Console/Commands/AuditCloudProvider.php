<?php
namespace App\Console\Commands;

use App\Services\CloudWorkspaces\ProviderAudit;
use Illuminate\Console\Command;

final class AuditCloudProvider extends Command
{
    protected $signature = 'vibyra:cloud-provider-audit';
    protected $description = 'Stop verified stale hosted generations and gate provisioning on resource ownership';
    public function handle(ProviderAudit $audit): int
    {
        if (!config('cloud_workspaces.fly_token') || !config('cloud_workspaces.fly_org')) {
            $this->error('Cloud provider credentials have not been configured.'); return self::FAILURE;
        }
        $ok = $audit->run();
        $this->line($ok ? 'Provider audit passed.' : 'Cloud starts are blocked pending provider/resource reconciliation.');
        return $ok ? self::SUCCESS : self::FAILURE;
    }
}
