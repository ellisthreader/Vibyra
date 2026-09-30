<?php

namespace App\Console\Commands;

use App\Jobs\DeliverRemoteSecurityNotification;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class RetryRemoteSecurityNotifications extends Command
{
    protected $signature = 'vibyra:security-notifications';
    protected $description = 'Retry durable remote security notification deliveries';
    public function handle(): int
    {
        DB::table('security_event_deliveries')->where(fn ($q) => $q->where('status', 'pending')->where(fn ($due) => $due->whereNull('next_attempt_at')->orWhere('next_attempt_at', '<=', now()))
            ->orWhere(fn ($q) => $q->where('status', 'processing')->where('claimed_at', '<', now()->subMinutes(2))))->orderBy('id')->limit(200)->pluck('id')
            ->each(fn ($id) => DeliverRemoteSecurityNotification::dispatch($id));
        return self::SUCCESS;
    }
}
