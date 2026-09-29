<?php

namespace App\Console\Commands;

use App\Services\ReleaseCapacity;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class CheckReleaseCapacity extends Command
{
    protected $signature = 'vibyra:release-capacity {--incoming-bytes=0}';
    protected $description = 'Check release disk headroom before upload and emit capacity warnings';

    public function handle(ReleaseCapacity $capacity): int
    {
        $path = (string) config('releases.capacity_path');
        $incoming = filter_var($this->option('incoming-bytes'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
        if (! is_dir($path) || $incoming === false) {
            $this->error('Release capacity path or incoming byte count is invalid.');

            return self::FAILURE;
        }
        $total = disk_total_space($path);
        $free = disk_free_space($path);
        if ($total === false || $free === false) {
            $this->error('Cannot measure release storage.');

            return self::FAILURE;
        }
        $result = $capacity->assess($total, $free, $incoming);
        $this->line(json_encode($result, JSON_THROW_ON_ERROR));
        if ($result['status'] !== 'ok') {
            Log::log($result['status'] === 'critical' ? 'critical' : 'warning', 'Release storage capacity', $result);
        }

        return $result['uploadAllowed'] && $result['status'] !== 'critical' ? self::SUCCESS : self::FAILURE;
    }
}
