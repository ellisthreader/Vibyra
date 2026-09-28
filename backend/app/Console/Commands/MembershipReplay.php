<?php

namespace App\Console\Commands;

use App\Services\Membership\StripeEvents;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\{Crypt, DB};
use Stripe\{Event, StripeClient};

final class MembershipReplay extends Command
{
    protected $signature = 'vibyra:membership-replay {--limit=50}';
    protected $description = 'Retry failed verified Stripe notifications without minting duplicate allowances.';
    public function handle(): int
    {
        $secret = config('services.stripe.secret');
        if (!$secret) { $this->error('Stripe is not configured.'); return self::FAILURE; }
        $prefix = 'stripe:'.config('membership.stripe_environment').':';
        $events = DB::table('membership_events')->where('id', 'like', $prefix.'%')
            ->whereIn('status', ['pending', 'failed'])->orderBy('created_at')->limit(min(500, max(1, (int) $this->option('limit'))))->get();
        $failed = 0;
        foreach ($events as $event) {
            try {
                app(StripeEvents::class)->handle(Event::constructFrom(json_decode(Crypt::decryptString($event->payload), true, flags: JSON_THROW_ON_ERROR)), new StripeClient($secret));
                $this->line($event->id.': reconciled');
            } catch (\Throwable $e) { ++$failed; $this->warn($event->id.': still pending reconciliation'); }
        }
        return $failed ? self::FAILURE : self::SUCCESS;
    }
}
