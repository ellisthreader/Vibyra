<?php
namespace App\Console\Commands;

use App\Services\CloudComputer\Activity\ActivityRetention;
use App\Services\CloudComputer\Owners\ConversationOwners;
use Illuminate\Console\Command;

final class PruneCloudActivity extends Command
{
    protected $signature = 'vibyra:cloud-activity-prune';
    protected $description = 'Drop old Cloud Host events and clear idle PC titles while keeping ownership generations';

    public function handle(ActivityRetention $retention, ConversationOwners $owners): int
    {
        $this->info('Pruned '.$retention->sweep().' activity events and cleared '.$owners->sweep().' idle PC titles.');
        return self::SUCCESS;
    }
}
