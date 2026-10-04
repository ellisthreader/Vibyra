<?php

namespace App\Console\Commands;

use App\Services\Platform\WebhookEndpoints;
use App\Services\Platform\WebhookSender;
use Illuminate\Console\Command;

/** Re-offers outbound webhook deliveries that are due (a lost queue message, a worker that died mid-send). */
class SweepPlatformWebhooks extends Command
{
    protected $signature = 'vibyra:platform-webhooks-sweep';
    protected $description = 'Re-offer due outbound webhook deliveries to the queue.';

    public function handle(WebhookSender $sender): int
    {
        if (WebhookEndpoints::enabled()) $this->info('Offered '.$sender->sweep().' deliveries.');
        return self::SUCCESS;
    }
}
