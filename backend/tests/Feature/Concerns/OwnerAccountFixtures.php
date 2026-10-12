<?php

namespace Tests\Feature\Concerns;

use App\Models\User;
use App\Services\Auth\{Totp, TwoFactor};
use Illuminate\Support\Facades\{Http, Notification, Queue};
use Illuminate\Support\Str;

trait OwnerAccountFixtures
{
    private User $owner;
    private User $target;

    private function accounts(): void
    {
        config(['owner_analytics.emails' => ['owner@example.test'], 'membership.enabled' => false]);
        Notification::fake(); Queue::fake(); Http::preventStrayRequests();
        $this->owner = User::factory()->create(['email' => 'owner@example.test']);
        $this->target = User::factory()->create(['name' => 'Jordan Example', 'email' => 'jordan@example.test', 'credits_balance' => 20]);
    }

    private function unlockOwner(): void
    {
        $two = app(TwoFactor::class); $totp = app(Totp::class);
        $secret = $two->start($this->owner);
        $two->confirm($this->owner, $totp->at($totp->decode($secret), intdiv(time(), Totp::PERIOD)));
        $this->actingAs($this->owner)->withSession(['owner_second_factor_user_id' => $this->owner->id,
            'owner_second_factor_verified_at' => now()->timestamp]);
        $this->withHeader('X-Owner-Account', (string) $this->owner->id);
    }

    private function action(array $overrides = []): array
    {
        return [...['request_id' => (string) Str::uuid(), 'action' => 'credit', 'revision' => 0,
            'balance' => 'credits', 'amount' => 25, 'reason' => 'Support adjustment'], ...$overrides];
    }

    private function accountUrl(?int $id = null): string
    {
        return '/web-api/owner/accounts/'.($id ?? $this->target->id);
    }
}
