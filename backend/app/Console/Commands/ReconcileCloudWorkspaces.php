<?php
namespace App\Console\Commands;

use App\Services\CloudWorkspaces\{Lifecycle, Workspaces};
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

final class ReconcileCloudWorkspaces extends Command
{
    protected $signature = 'vibyra:cloud-workspaces {--stop-all : Emergency stop without needing customer balances}';
    protected $description = 'Reconcile managed coding computers and enforce expiring compute authority';
    public function handle(): int
    {
        $failed = false;
        foreach (DB::table('cloud_workspaces')->whereIn('state', Workspaces::ACTIVE)->orderBy('id')->get() as $w) {
            try {
                if ($this->option('stop-all')) app(\App\Services\CloudWorkspaces\Shutdown::class)->request($w->user_id, $w->id, 'operator_stop');
                app(Lifecycle::class)->reconcile($w->id);
            } catch (\Throwable) { $this->error('Reconciliation pending: '.$w->id); $failed = true; }
        }
        foreach (DB::table('cloud_workspaces')->whereIn('state', ['stopped', 'archived', 'deleting'])->get() as $w) {
            try { app(\App\Services\CloudWorkspaces\Retention::class)->reconcile($w); }
            catch (\Throwable) { $this->error('Retention pending: '.$w->id); $failed = true; }
        }
        DB::table('cloud_preview_tickets')->where('expires_at', '<', now())->delete();
        return $failed ? self::FAILURE : self::SUCCESS;
    }
}
