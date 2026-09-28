<?php

namespace App\Console\Commands;

use App\Services\Billing\ChatCostReservationService;
use Illuminate\Console\Command;

class RecoverChatCostReservations extends Command
{
    protected $signature = 'vibyra:recover-chat-cost-reservations {--limit=100}';
    protected $description = 'Release or conservatively settle expired chat cost reservations.';

    public function handle(ChatCostReservationService $service): int
    {
        $result = $service->recoverStale(max(1, (int) $this->option('limit')));
        $this->info("Released {$result['released']}; settled {$result['settled']}.");

        return self::SUCCESS;
    }
}
