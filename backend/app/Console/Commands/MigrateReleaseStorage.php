<?php

namespace App\Console\Commands;

use App\Services\ReleaseStorage;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class MigrateReleaseStorage extends Command
{
    protected $signature = 'vibyra:release-storage-copy {destination} {--source=local} {--execute}';
    protected $description = 'Inventory or copy releases with read-back SHA-256 verification; never delete originals';

    public function handle(ReleaseStorage $storage): int
    {
        $source = (string) $this->option('source');
        $destination = (string) $this->argument('destination');
        if (! config("filesystems.disks.{$destination}") || $destination === $source) {
            $this->error('Choose a configured destination different from the source.');

            return self::FAILURE;
        }
        foreach (Storage::disk($source)->allFiles('releases') as $path) {
            $row = $this->option('execute') ? $storage->copyVerified($path, $source, $destination)
                : ['path' => $path, 'bytes' => Storage::disk($source)->size($path)];
            $this->line(json_encode($row, JSON_THROW_ON_ERROR));
        }

        return self::SUCCESS;
    }
}
