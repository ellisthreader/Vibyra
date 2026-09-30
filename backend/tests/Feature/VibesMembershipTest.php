<?php
namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use App\Services\Vibes\{AccountMembership, Purchases, Wallet};
use App\Services\Billing\MembershipEntitlement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class VibesMembershipTest extends TestCase
{
    use RefreshDatabase;

    public function test_verified_purchase_upgrades_both_sessions_once_and_expiry_preserves_paid_vibes(): void
    {
        config(['vibes.enabled' => true]);
        $u = User::factory()->create(['plan' => 'free']);
        $w = app(Wallet::class)->ensure($u);
        $before = app(Wallet::class)->available($u->id);
        $t = ['transactionId' => 'membership-1', 'originalTransactionId' => 'membership-1',
            'productId' => 'app.vibyra.vibes.builder.monthly', 'appAccountToken' => $w->account_token,
            'inAppOwnershipType' => 'PURCHASED', 'purchaseDate' => now()->getTimestampMs(),
            'expiresDate' => now()->addMonth()->getTimestampMs()];
        app(Purchases::class)->apply($u->id, $t);
        app(Purchases::class)->apply($u->id, $t);
        foreach (['phone', 'desktop'] as $device) {
            VibyraSession::create(['user_id' => $u->id, 'token_hash' => hash('sha256', $device), 'device_name' => $device]);
            $this->withToken($device)->getJson('/api/session')->assertOk()
                ->assertJsonPath('user.plan', 'builder')->assertJsonPath('user.billingProvider', 'iap-apple')
                ->assertJsonPath('user.maxActiveProjects', 0)->assertJsonPath('user.maxConcurrentAgents', 3)
                ->assertJsonPath('user.vibesBalance', $before + 1000);
        }
        $this->assertTrue(app(MembershipEntitlement::class)->active($u));
        $this->assertSame('free', $u->fresh()->plan, 'Legacy billing is not overwritten or credited twice.');
        $this->travel(32)->days();
        $this->assertNull(app(AccountMembership::class)->for($u));
        $this->assertFalse(app(MembershipEntitlement::class)->active($u));
        $this->assertSame($before + 1000, app(Wallet::class)->available($u->id));
    }

    public function test_refund_removes_membership_and_grant(): void
    {
        config(['vibes.enabled' => true]);
        $u = User::factory()->create(['plan' => 'free']);
        $w = app(Wallet::class)->ensure($u);
        $before = app(Wallet::class)->available($u->id);
        $t = ['transactionId' => 'refund-1', 'originalTransactionId' => 'refund-1',
            'productId' => 'app.vibyra.vibes.pro.monthly', 'appAccountToken' => $w->account_token,
            'inAppOwnershipType' => 'PURCHASED', 'purchaseDate' => now()->getTimestampMs(),
            'expiresDate' => now()->addMonth()->getTimestampMs()];
        app(Purchases::class)->apply($u->id, $t);
        $this->assertSame('pro', app(AccountMembership::class)->for($u)['plan']);
        app(Purchases::class)->apply($u->id, [...$t, 'revocationDate' => now()->getTimestampMs()]);
        $this->assertNull(app(AccountMembership::class)->for($u));
        $this->assertSame($before, app(Wallet::class)->available($u->id));
    }
}
