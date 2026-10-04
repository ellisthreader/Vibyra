<?php

namespace App\Jobs;

use App\Services\Platform\WebhookSender;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/** One attempt at one webhook delivery; a failed attempt schedules its own next one (see WebhookSender). */
class DeliverPlatformWebhook implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;
    public int $timeout = 30;

    public function __construct(public string $deliveryId) {}

    public function handle(WebhookSender $sender): void
    {
        $sender->attempt($this->deliveryId);
    }
}
