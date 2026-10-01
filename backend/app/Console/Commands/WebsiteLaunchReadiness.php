<?php

namespace App\Console\Commands;

use App\Services\Website\LaunchReadiness;
use Illuminate\Console\Command;

final class WebsiteLaunchReadiness extends Command
{
    protected $signature = 'vibyra:website-launch-readiness';
    protected $description = 'Inspect production website configuration without exposing secrets or making provider requests.';

    public function handle(LaunchReadiness $readiness): int
    {
        $result = $readiness->read();
        $this->line(json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        return $result['ready'] ? self::SUCCESS : self::FAILURE;
    }
}
