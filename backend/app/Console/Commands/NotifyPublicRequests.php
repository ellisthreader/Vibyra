<?php

namespace App\Console\Commands;

use App\Jobs\NotifyPublicRequest;
use App\Models\PublicRequest;
use Illuminate\Console\Command;

class NotifyPublicRequests extends Command
{
    protected $signature = 'vibyra:notify-public-requests';
    protected $description = 'Recover support email notifications for stored public requests';

    public function handle(): int
    {
        PublicRequest::query()->whereNull('owner_notified_at')->where('status', '!=', 'closed')
            ->where(fn ($query) => $query->whereNull('owner_notification_attempted_at')
                ->orWhere('owner_notification_attempted_at', '<=', now()->subMinutes(5)))
            ->orderBy('id')->limit(50)->pluck('id')
            ->each(fn (int $id) => NotifyPublicRequest::dispatch($id));

        return self::SUCCESS;
    }
}
