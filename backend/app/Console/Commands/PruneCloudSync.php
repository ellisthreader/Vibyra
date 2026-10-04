<?php
namespace App\Console\Commands;

use App\Services\CloudComputer\SyncRetention;
use Illuminate\Console\Command;

final class PruneCloudSync extends Command
{
    protected $signature = 'vibyra:cloud-sync-prune';
    protected $description = 'Prune cloud-sync bundles: keep the 3 newest per chain plus un-applied, drop acked and abandoned downloads and finished removals';

    public function handle(SyncRetention $retention): int
    {
        $this->info('Pruned '.$retention->sweep().' sync blobs.');
        return self::SUCCESS;
    }
}
